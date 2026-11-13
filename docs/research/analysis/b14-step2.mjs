// Phân tích bước 2 của B-14 (A/B runtimes.claude-cli.stablePrefix): preregistration.md §9 "Đăng ký trước bước 2 của B-14" (4)–(8)
// và V4-3e-(c) mục 3. Chỉ ĐỌC runs.jsonl của hai nhánh; không chạy benchmark, không tạo dữ liệu.
// Dùng: node docs/research/analysis/b14-step2.mjs [--off <path>] [--on <path>] [--json] [--retries last|first] [--exclude off|t3-api|1]
// Hàm thống kê lấy từ bench/vs-claude/lib/stats.mjs (bản SAU D12), KHÔNG từ analysis/vendor/ (bản trước D12, chỉ dành cho K2 §10).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { permStratified, mulberry32, percentileCI } from '../../../bench/vs-claude/lib/stats.mjs';
import { zInv } from '../../../bench/vs-claude/harness/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.resolve(HERE, '../../../bench/vs-claude/results/b14-step2');

export const TASKS = ['t2-orders', 't3-api', 't4-perf'];
export const REPS = 16; // mỗi ô bài × nhánh
export const N_FULL = REPS * TASKS.length * 2; // 96
export const MAX_REPLACEMENTS = 2; // §9 (8): tối đa 2 lượt thay mỗi ô
export const SEED = 20261104;
export const B_BOOT = 4000;
/** Tham số đăng ký (§9 (6)). Không thêm khóa nào: `ceilGuard` mặc định = (margin !== 0) = false. */
export const PERM_OPTS = Object.freeze({ alt: 'two', margin: 0, M: 10000, seed: SEED });
export const PLAN_DELTA = Math.log(1 / 0.9); // hiệu ứng kế hoạch 10 % (§9 (4))
export const PLAN_SIGMA = 0.182;

export const defaultDeps = { permStratified };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pairOf = (rep) => Math.ceil(rep / 4); // ABBA: r1–4 cặp 1, …, r13–16 cặp 4

/** (a) tokens.weighted; thiếu thì input + 1,25·cacheWrite + 0,1·cacheRead + 5·out (làm tròn như runner `weighted`). Tên trường out của runner là `output`. */
export function weightedOf(tokens) {
  if (!tokens) return null;
  if (isNum(tokens.weighted)) return tokens.weighted;
  const out = tokens.output ?? tokens.out;
  if (![tokens.input, tokens.cacheRead, out].every(isNum)) return null;
  return Math.round(tokens.input + 1.25 * (tokens.cacheWrite ?? 0) + 0.1 * tokens.cacheRead + 5 * out);
}

/** Lý do loại một dòng (§9 (8)): chỉ theo trạng thái, không theo token/h/điểm. null = dùng được. */
function dropReason(r) {
  if (!TASKS.includes(r.task)) return 'bài ngoài bộ đăng ký';
  if (!Number.isInteger(r.rep) || r.rep < 1) return 'thiếu rep hợp lệ';
  if (r.status !== 'done') return `status ≠ done (${r.status ?? 'không có'})`;
  if (r.excluded != null) return `excluded (${r.excluded})`;
  const w = weightedOf(r.tokens);
  if (!(w > 0)) return 'thiếu token (không tính được ln)';
  return null;
}

function normalCdf(x) { // Abramowitz–Stegun 7.1.26, sai số < 1,5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Clopper–Pearson 95 % hai phía (chia đôi trên phân phối nhị thức). */
export function clopperPearson(x, n, alpha = 0.05) {
  if (!n) return [null, null];
  const lc = [0]; for (let i = 1; i <= n; i++) lc.push(lc[i - 1] + Math.log(i));
  const pmf = (k, p) => (p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(lc[n] - lc[k] - lc[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p)));
  const upper = (p) => { let s = 0; for (let k = x; k <= n; k++) s += pmf(k, p); return s; }; // P(X ≥ x), tăng theo p
  const lower = (p) => { let s = 0; for (let k = 0; k <= x; k++) s += pmf(k, p); return s; }; // P(X ≤ x), giảm theo p
  const bis = (f, target, inc) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if ((f(m) < target) === inc) lo = m; else hi = m; } return (lo + hi) / 2; };
  return [x === 0 ? 0 : bis(upper, alpha / 2, true), x === n ? 1 : bis(lower, alpha / 2, false)];
}

/** Bootstrap phân tầng: mỗi bài lấy lại có hoàn lại trong từng nhánh; T* = TB theo bài của hiệu TB. Trả CI 95 % của R = exp(T). */
function bootstrapR(cells, B = B_BOOT, seed = SEED) {
  if (!cells.length) return null;
  const rnd = mulberry32(seed), rs = [];
  const resampleMean = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[(rnd() * x.length) | 0]; return s / x.length; };
  for (let i = 0; i < B; i++) { let t = 0; for (const c of cells) t += resampleMean(c.b) - resampleMean(c.a); rs.push(Math.exp(t / cells.length)); }
  return percentileCI(rs, 0.95);
}

const tOf = (cells) => (cells.length ? mean(cells.map((c) => mean(c.b) - mean(c.a))) : NaN);
const position = (ci) => (ci[1] < 1 ? 'dưới 1' : ci[0] > 1 ? 'trên 1' : 'chứa 1');

/**
 * Gom các lần chạy lại cùng khóa (bài, rep) — sửa 13/11/2026 (sai lệch ghi ở §9 và RUNLOG b14-step2).
 * Runner (`bench/vs-claude/lib/queue.mjs` isFinishedRow) chạy lại ĐÚNG KHÓA khi dòng là `infra` (hạn mức, lỗi hạ tầng) hoặc
 * chưa xong (`failed` không có `excluded`); lượt `done` mới là quan sát của khóa đó. Bản trước giữ dòng ĐẦU của khóa nên dòng
 * `infra` chặn mất lượt `done` sau nó. Ở đây: dòng `infra` không phải quan sát; trong các dòng còn lại, dòng `done` đầu tiên là
 * quan sát, các dòng không xong trước nó là lượt bị loại theo (8) ("status ≠ done") và lượt `done` là lượt thay cùng khóa
 * (tính vào trần 2 lượt thay mỗi ô). Khóa không có dòng `done` giữ dòng cuối (bị loại theo status). Dòng thừa sau `done` đếm là trùng.
 */
export function collapseRetries(rows) {
  const byKey = new Map();
  for (const r of rows) { const k = `${r.task}|${r.rep}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const out = [], notes = { infra: 0, retried: [], dupAfterDone: 0 };
  for (const rs of byKey.values()) {
    const real = rs.filter((r) => r.status !== 'infra');
    notes.infra += rs.length - real.length;
    if (!real.length) { out.push(rs.at(-1)); continue; }
    const iDone = real.findIndex((r) => r.status === 'done');
    const pick = iDone >= 0 ? iDone : real.length - 1;
    for (let i = 0; i < pick; i++) notes.retried.push({ task: real[i].task, rep: real[i].rep, status: real[i].status ?? null, sameKeyDone: iDone >= 0 });
    notes.dupAfterDone += real.length - 1 - pick;
    out.push(iDone > 0 ? { ...real[pick], _sameKeyReplacement: true } : real[pick]);
  }
  return { rows: out, notes };
}

/**
 * rowsOff, rowsOn: mảng dòng runs.jsonl của nhánh tắt/bật (cùng arm B7; nhánh phân biệt bằng thư mục, không bằng `arm`).
 * deps.permStratified: tiêm để test kiểm tham số; mặc định là hàm của bench/vs-claude/lib/stats.mjs.
 * opts.retries: 'last' (mặc định, xem collapseRetries) | 'first' (cách của bản đầu, giữ dòng đầu mỗi khóa — chỉ để đối chiếu).
 * opts.exclude: danh sách `${nhánh}|${bài}|${rep}` bỏ khỏi phân tích (phân tích độ nhạy, không phải phép kiểm chính).
 */
export function analyze(rowsOff, rowsOn, deps = defaultDeps, opts = {}) {
  const retryMode = opts.retries ?? 'last';
  const exclude = new Set(opts.exclude ?? []);
  const perm = deps.permStratified ?? permStratified;
  const arms = { off: rowsOff ?? [], on: rowsOn ?? [] };
  const drops = {}; // lý do → số lượt
  const bump = (why, k = 1) => { drops[why] = (drops[why] ?? 0) + k; };
  const skipped = []; // [{ task, reason }]
  const assignments = []; // lượt thay thế đã gán
  const cellsRows = {}; // `${arm}|${task}` → [{ row, rep, pair, w }]

  // 1–2. Phân loại, gán lượt thay thế (§9 (8)), suy cặp khối theo rep.
  const retryNotes = {};
  for (const [arm, rowsIn] of Object.entries(arms)) {
    let rows = rowsIn;
    const sameKey = Object.fromEntries(TASKS.map((t) => [t, 0]));
    if (retryMode === 'last') {
      const c = collapseRetries(rowsIn);
      rows = c.rows; retryNotes[arm] = c.notes;
      if (c.notes.infra) bump('dòng hạ tầng (infra), chạy lại cùng khóa — không phải quan sát', c.notes.infra);
      if (c.notes.dupAfterDone) bump('trùng khóa (bài, rep)', c.notes.dupAfterDone);
      for (const x of c.notes.retried) {
        bump(`status ≠ done (${x.status ?? 'không có'})${x.sameKeyDone ? ', thay bằng lượt cùng khóa' : ''}`);
        if (x.sameKeyDone && TASKS.includes(x.task)) sameKey[x.task]++;
      }
    }
    const seen = new Set();
    const byTask = Object.fromEntries(TASKS.map((t) => [t, []]));
    for (const r of rows) {
      const key = `${r.task}|${r.rep}`;
      if (exclude.has(`${arm}|${key}`)) { bump('bỏ theo phân tích độ nhạy (opts.exclude)'); continue; }
      if (TASKS.includes(r.task) && Number.isInteger(r.rep) && seen.has(key)) { bump('trùng khóa (bài, rep)'); continue; }
      seen.add(key);
      const why = dropReason(r);
      if (!TASKS.includes(r.task) || !Number.isInteger(r.rep) || r.rep < 1) { bump(why); continue; }
      byTask[r.task].push({ row: r, rep: r.rep, why });
    }
    for (const task of TASKS) {
      const all = byTask[task].sort((x, y) => x.rep - y.rep);
      const originals = all.filter((x) => x.rep <= REPS && x.why);
      const repls = all.filter((x) => x.rep > REPS);
      if (repls.length + sameKey[task] > MAX_REPLACEMENTS) {
        skipped.push({ task, reason: `ô ${arm} × ${task}: ${repls.length + sameKey[task]} lượt thay > ${MAX_REPLACEMENTS} (thiếu dữ liệu)` });
        all.forEach((x) => bump('ô thiếu dữ liệu (quá số lượt thay)'));
        continue;
      }
      const kept = [];
      for (const x of all) if (x.rep <= REPS) {
        if (x.why) { bump(x.why); continue; }
        if (x.row._sameKeyReplacement) assignments.push({ arm, task, rep: x.rep, replaces: x.rep, pair: pairOf(x.rep), sameKey: true });
        kept.push({ ...x, pair: pairOf(x.rep) });
      }
      repls.forEach((x, k) => {
        if (k >= originals.length) { bump('thay thế không có lượt gốc'); return; }
        if (x.why) { bump(x.why); return; }
        const orig = originals[k];
        assignments.push({ arm, task, rep: x.rep, replaces: orig.rep, pair: pairOf(orig.rep) });
        kept.push({ ...x, pair: pairOf(orig.rep) });
      });
      cellsRows[`${arm}|${task}`] = kept;
    }
  }
  const skippedTasks = new Set(skipped.map((s) => s.task));
  for (const t of skippedTasks) for (const arm of Object.keys(arms)) delete cellsRows[`${arm}|${t}`];
  const liveTasks = TASKS.filter((t) => !skippedTasks.has(t));

  // 3. Dừng giữa chừng: chỉ giữ cặp khối có lượt dùng được ở mọi bài × cả hai nhánh.
  const pairsKept = [1, 2, 3, 4].filter((p) => liveTasks.length && liveTasks.every((t) => Object.keys(arms).every((arm) => (cellsRows[`${arm}|${t}`] ?? []).some((x) => x.pair === p))));
  for (const k of Object.keys(cellsRows)) {
    const keep = cellsRows[k].filter((x) => pairsKept.includes(x.pair));
    bump('cặp khối không đủ cả hai nhánh', cellsRows[k].length - keep.length);
    cellsRows[k] = keep;
  }
  if (!drops['cặp khối không đủ cả hai nhánh']) delete drops['cặp khối không đủ cả hai nhánh'];

  const lnW = (x) => Math.log(weightedOf(x.row.tokens));
  const cells = liveTasks.map((task) => ({ task, a: (cellsRows[`off|${task}`] ?? []).map(lnW), b: (cellsRows[`on|${task}`] ?? []).map(lnW) }));
  const n = Object.values(cellsRows).reduce((s, v) => s + v.length, 0);
  const nLabel = n >= N_FULL ? `đủ ${N_FULL}` : `chưa đủ N (n = ${n}/${N_FULL})`;

  // 4. Phép kiểm chính: đúng một lần gọi, đúng tham số đăng ký.
  const permArgs = { ...PERM_OPTS };
  const pr = perm(cells, permArgs);
  const T = tOf(cells.filter((c) => c.a.length && c.b.length));
  const R = Math.exp(T);
  const ci = bootstrapR(cells.filter((c) => c.a.length && c.b.length));
  let verdict;
  if (pr.p == null || !Number.isFinite(T) || !ci || skipped.length || liveTasks.length < TASKS.length) verdict = 'không kết luận (thiếu dữ liệu)';
  else if (pr.p <= 0.05 && ci[1] < 1) verdict = 'giảm';
  else if (pr.p <= 0.05 && ci[0] > 1) verdict = 'tăng';
  else verdict = 'không phân biệt được';

  // 5. Thước đo phụ (mô tả, không p).
  const secondary = { byTaskArm: [], byArm: {} };
  for (const arm of Object.keys(arms)) {
    const all = liveTasks.flatMap((t) => cellsRows[`${arm}|${t}`] ?? []);
    const pass = all.filter((x) => x.row.pass === true).length;
    const sc = all.map((x) => x.row.score).filter(isNum), wall = all.map((x) => x.row.wallSec).filter(isNum), calls = all.map((x) => x.row.calls).filter(isNum);
    secondary.byArm[arm] = { n: all.length, pass, passRate: all.length ? pass / all.length : null, passCP95: clopperPearson(pass, all.length), scoreMean: sc.length ? mean(sc) : null, wallSecMean: wall.length ? mean(wall) : null, wallSecMedian: median(wall), callsMean: calls.length ? mean(calls) : null, callsMedian: median(calls) };
    for (const t of liveTasks) {
      const c = cellsRows[`${arm}|${t}`] ?? [];
      const hs = c.map((x) => { const k = x.row.tokens; const d = k.cacheRead + (k.cacheWrite ?? 0) + k.input; return d > 0 ? k.cacheRead / d : null; }).filter(isNum);
      const sw = c.reduce((s, x) => s + weightedOf(x.row.tokens), 0), cw = c.reduce((s, x) => s + 1.25 * (x.row.tokens.cacheWrite ?? 0), 0);
      secondary.byTaskArm.push({ task: t, arm, n: c.length, hMedian: median(hs), cacheWriteShare: sw > 0 ? cw / sw : null });
    }
  }

  // 6. Độ nhạy V4-3e-(c) mục 3: chỉ mô tả, không p, không gọi permStratified.
  const full = cells.filter((c) => c.a.length && c.b.length);
  const sensitivity = { leaveOneTaskOut: [], sigma: null };
  if (full.length === TASKS.length && ci) {
    for (const drop of TASKS) {
      const sub = full.filter((c) => c.task !== drop), Ti = tOf(sub), Ri = Math.exp(Ti), cii = bootstrapR(sub);
      const flip = Math.sign(Math.log(Ri)) !== Math.sign(T) || position(cii) !== position(ci);
      sensitivity.leaveOneTaskOut.push({ dropped: drop, R: Ri, ci95: cii, nhayVoiBai: flip });
    }
  }
  let ss = 0, df = 0;
  for (const c of full) for (const x of [c.a, c.b]) if (x.length > 1) { const m = mean(x); ss += x.reduce((s, v) => s + (v - m) ** 2, 0); df += x.length - 1; }
  if (df > 0 && full.length) {
    const sigma = Math.sqrt(ss / df);
    const se = Math.sqrt(full.reduce((s, c) => s + sigma ** 2 * (1 / c.a.length + 1 / c.b.length), 0)) / full.length; // = σ/√24 khi r = 16, 3 bài
    const za = zInv(0.975), zb = zInv(0.8);
    const power = (d) => normalCdf(d / se - za) + normalCdf(-d / se - za);
    sensitivity.sigma = { sigmaObserved: sigma, sigmaPlanned: PLAN_SIGMA, df, seT: se, mdeLn: (za + zb) * se, mdeSavingPct: 100 * (1 - Math.exp(-(za + zb) * se)), powerAtPlanDelta: power(PLAN_DELTA), powerAt5pct: power(Math.log(1 / 0.95)), note: 'xấp xỉ chuẩn, cùng công thức §9 (4); chỉ mô tả' };
  }

  return {
    n, nLabel, pairsKept, T, R, ci95: ci, p: pr.p, verdict, perm: { n: pr.n, exact: pr.exact, nPerm: pr.nPerm, skipped: pr.skipped, label: pr.label },
    permArgs, cells: cells.map((c) => ({ task: c.task, nOff: c.a.length, nOn: c.b.length })), skipped, drops, assignments, secondary, sensitivity,
    retryMode, exclude: [...exclude], retryNotes,
    notes: ['permStratified nằm ở bench/vs-claude/lib/stats.mjs:272; §9 (6) ghi :162 là số dòng trước D12.', 'ceilGuard mặc định tắt vì margin = 0; ∏C(32,16) > 10⁶ nên hàm chạy Monte Carlo, p = (k + 1)/(M + 1).'],
  };
}

// ---------- đầu ra ----------
const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));
const pct = (v) => (v == null ? '—' : `${f(100 * v, 1)} %`);

export function toMarkdown(r) {
  const L = [];
  L.push('# Bước 2 của B-14: kết quả phân tích', '');
  L.push(`- **Cách gom dòng chạy lại:** ${r.retryMode === 'first' ? 'giữ dòng đầu mỗi khóa (cách của bản đầu, chỉ để đối chiếu)' : 'dòng infra không phải quan sát; lượt done cùng khóa thay lượt không xong (collapseRetries)'}${r.exclude?.length ? `; bỏ theo độ nhạy: ${r.exclude.join(', ')}` : ''}`);
  L.push(`- **Số lượt dùng được:** ${r.n} — nhãn: **${r.nLabel}**; cặp khối giữ: ${r.pairsKept.join(', ') || 'không'}`);
  L.push(`- **T** (TB theo bài của TB ln bật − TB ln tắt) = ${f(r.T)}; **R̂ = exp(T)** = ${f(r.R)}; CI 95 % bootstrap (${B_BOOT} vòng, hạt ${SEED}) = ${r.ci95 ? `[${f(r.ci95[0])}; ${f(r.ci95[1])}]` : '—'}`);
  L.push(`- **p hai phía** (permStratified, ${r.perm.exact ? 'đủ' : 'Monte Carlo'}) = ${f(r.p, 4)}`);
  L.push(`- **Phán quyết: ${r.verdict}**`, `- Tham số đã truyền: \`${JSON.stringify(r.permArgs)}\``, '');
  L.push('| Bài | n tắt | n bật |', '|---|--:|--:|', ...r.cells.map((c) => `| ${c.task} | ${c.nOff} | ${c.nOn} |`), '');
  if (r.skipped.length) L.push('**Ô thiếu dữ liệu:**', ...r.skipped.map((s) => `- ${s.reason}`), '');
  L.push('**Lượt bị loại theo lý do:**', ...(Object.keys(r.drops).length ? Object.entries(r.drops).map(([k, v]) => `- ${k}: ${v}`) : ['- không có']), '');
  if (r.assignments.length) L.push('**Lượt thay thế đã gán:**', ...r.assignments.map((a) => (a.sameKey ? `- ${a.arm} × ${a.task}: rep ${a.rep} chạy lại cùng khóa thay lượt không xong (cặp ${a.pair})` : `- ${a.arm} × ${a.task}: rep ${a.rep} thay rep ${a.replaces} (cặp ${a.pair})`)), '');
  L.push('## Thước đo phụ (mô tả, không p)', '', '| Bài | Nhánh | n | h trung vị | 1,25·cacheWrite / weighted |', '|---|---|--:|--:|--:|');
  for (const x of r.secondary.byTaskArm) L.push(`| ${x.task} | ${x.arm === 'on' ? 'bật' : 'tắt'} | ${x.n} | ${f(x.hMedian)} | ${f(x.cacheWriteShare)} |`);
  L.push('', '| Nhánh | n | pass | CP 95 % | score TB | wallSec TB (trung vị) | calls TB (trung vị) |', '|---|--:|--:|---|--:|--:|--:|');
  for (const [arm, s] of Object.entries(r.secondary.byArm)) L.push(`| ${arm === 'on' ? 'bật' : 'tắt'} | ${s.n} | ${pct(s.passRate)} | ${s.passCP95[0] == null ? '—' : `[${pct(s.passCP95[0])}; ${pct(s.passCP95[1])}]`} | ${f(s.scoreMean)} | ${f(s.wallSecMean, 1)} (${f(s.wallSecMedian, 1)}) | ${f(s.callsMean, 1)} (${f(s.callsMedian, 1)}) |`);
  L.push('', '## Độ nhạy (V4-3e-(c) mục 3; chỉ mô tả)', '');
  if (r.sensitivity.leaveOneTaskOut.length) L.push('| Bỏ bài | R̂ | CI 95 % | Cờ |', '|---|--:|---|---|', ...r.sensitivity.leaveOneTaskOut.map((s) => `| ${s.dropped} | ${f(s.R)} | [${f(s.ci95[0])}; ${f(s.ci95[1])}] | ${s.nhayVoiBai ? 'nhạy với bài' : '—'} |`), '');
  else L.push('Không tính bỏ-từng-bài (thiếu bài).', '');
  const sg = r.sensitivity.sigma;
  if (sg) L.push(`σ quan sát gộp trong bài = ${f(sg.sigmaObserved)} (kế hoạch ${f(sg.sigmaPlanned)}); SE(T) = ${f(sg.seT, 4)}; mức tiết kiệm nhỏ nhất phát hiện ≈ ${f(sg.mdeSavingPct, 1)} %; power ở 10 % ≈ ${f(sg.powerAtPlanDelta, 2)}, ở 5 % ≈ ${f(sg.powerAt5pct, 2)}.`, '');
  L.push('Kết quả "không phân biệt được" không phải bằng chứng không có hiệu ứng; báo CI của R.', '', ...r.notes.map((x) => `> ${x}`));
  return L.join('\n');
}

function readJsonl(file, label) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`Không đọc được tệp nhánh ${label}: ${file}. Bước 2 chưa chạy hoặc đường dẫn sai.`); }
  return txt.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`Tệp ${file}, dòng ${i + 1} không phải JSON hợp lệ.`); } });
}

export function main(argv = process.argv.slice(2)) {
  const opt = { off: path.join(RESULTS, 'off', 'runs.jsonl'), on: path.join(RESULTS, 'on', 'runs.jsonl'), json: false, retries: 'last', exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--off') opt.off = argv[++i]; else if (argv[i] === '--on') opt.on = argv[++i]; else if (argv[i] === '--json') opt.json = true;
    else if (argv[i] === '--retries' && ['last', 'first'].includes(argv[i + 1])) opt.retries = argv[++i];
    else if (argv[i] === '--exclude') opt.exclude.push(argv[++i]);
    else { console.error(`Tham số không hợp lệ: ${argv[i]}. Dùng: --off <path> --on <path> [--json] [--retries last|first] [--exclude nhánh|bài|rep]`); return 2; }
  }
  try {
    const res = analyze(readJsonl(opt.off, 'tắt'), readJsonl(opt.on, 'bật'), defaultDeps, { retries: opt.retries, exclude: opt.exclude });
    console.log(opt.json ? JSON.stringify(res, null, 2) : toMarkdown(res));
    return 0;
  } catch (e) { console.error(`Lỗi: ${e.message}`); return 1; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main();
