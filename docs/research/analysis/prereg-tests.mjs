#!/usr/bin/env node
// Phân tích xác nhận vòng 3 theo docs/research/preregistration.md v2.1 (đặc tả SR-04, phương án lùi §2.3).
// Chỉ đọc bench/vs-claude/results/study-cloud/runs.jsonl (+ config-*.json, artifacts/ nếu có). Node >= 22, không gói ngoài.
//
//   node prereg-tests.mjs                       in bảng ra stdout
//   node prereg-tests.mjs --write --commit1 <hash>   ghi round3-tables.md và excluded-round3.csv cạnh script
//   node prereg-tests.mjs --check <round3-tables.md> kiểm bảng (và CSV cạnh nó) trùng đầu ra script; exit 0/1
//
// Quy tắc cố định TRƯỚC khi chạy --write (không đổi sau commit 1):
//  - Loại lượt: §4.3 (Q, L, T) + E1/E4 + dòng status 'infra'; lượt được loại tự động theo cờ, không xem score (§4.1).
//  - B-01: log-tỉ số theo bài, bootstrap hai tầng (lấy lại bài, rồi lấy lại lượt trong ô), B = 4000, hạt 20261102,
//    CI 90 % phân vị, biên [0,85; 1,15]; IUT của (a) token có trọng số, (b) wallSec, (c) score.
//  - Trần (c): bài mà MỌI lượt của cả hai arm có score >= 0,99 thì bỏ khỏi (c) (cùng quy tắc mức lượt của H6, §2.5(b)).
//    Còn < 3 bài hoặc phân phối bootstrap suy biến => (c) "Không kết luận (trần/suy biến)", p = NA, B-01 không xác nhận được.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SEED = 20261102;
export const B = 4000;
export const MARGIN = [0.85, 1.15];
export const CEIL = 0.99;
export const MIN_TASKS_C = 3;
export const SCRIPT_VERSION = 'prereg-tests v1 (round 3)';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DATA = path.join(ROOT, 'bench', 'vs-claude', 'results', 'study-cloud');

// ---------- bộ thống kê nhỏ ----------
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** mulberry32: bộ sinh số giả ngẫu nhiên có hạt, kết quả giống nhau trên mọi máy. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const resample = (a, rnd) => a.map(() => a[Math.floor(rnd() * a.length)]);
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d).replace('.', ',')} %` : 'n/a');

// ---------- lọc lượt (§4.1, §4.3) ----------
const INFRA_RE = /429|usage.?limit|rate.?limit|quota|overloaded|ECONN|ENOENT|ETIMEDOUT/i;
/** Cửa sổ chạy; ranh giới theo thời điểm bắt đầu của lệnh kế tiếp (RUNLOG.md dòng 12–16), `at` là lúc ghi dòng. */
export const WINDOWS = [
  { id: 'W1', until: '2026-11-02T13:35:19Z', runlog: 'RUNLOG.md:12', expected: 54, server: 'main e0bd2f4' },
  { id: 'W2a', until: '2026-11-02T15:06:56Z', runlog: 'RUNLOG.md:13', expected: 24, server: 'main e0bd2f4' },
  { id: 'W2b', until: '2026-11-02T16:21:21Z', runlog: 'RUNLOG.md:14', expected: 30, server: 'nhánh 7fb18ba' },
  { id: 'W2c', until: '2026-11-02T16:41:22Z', runlog: 'RUNLOG.md:15', expected: 14, server: 'main e0bd2f4' },
  { id: 'B7a', until: '9999', runlog: 'RUNLOG.md:16', expected: 75, server: 'nhánh 7fb18ba' },
];
export const windowOf = (r) => WINDOWS.find((w) => r.at < w.until).id;

/** Trả {kept, excluded:[{row,window,code,reason,runlog}], flags:{...}}. Không đọc score/tokens để quyết định, trừ cờ Q/T tự động. */
export function classifyRows(rows, { timeoutMin = 20, finalText = () => '' } = {}) {
  const kept = [], excluded = [], seen = new Set();
  const flags = { tKeep: 0, n1Keep: 0, leakManual: 0, doneNearTimeout: 0, doneZeroTokens: 0 };
  for (const r of rows) {
    const w = windowOf(r), src = WINDOWS.find((x) => x.id === w).runlog;
    const ex = (code, reason) => excluded.push({ row: r, window: w, code, reason, runlog: src });
    const text = String(r.error ?? '') + finalText(r);
    const infra = INFRA_RE.test(text);
    if (seen.has(r.key)) { ex('E4', 'khóa lượt trùng (rep trùng)'); continue; }
    seen.add(r.key);
    if (r.status === 'infra') { ex('E4', 'status = infra (lỗi hạ tầng/hạn mức do harness ghi)'); continue; }
    if (r.leak === true) { flags.leakManual++; ex('L', 'leak = true (cần kiểm tay dương tính giả trước khi chốt, §4.3)'); continue; }
    if (r.status === 'error' && /ENOENT/.test(text)) { ex('E4', 'status = error kèm ENOENT (thiếu repo/)'); continue; }
    if (r.status === 'failed' || r.status === 'error') {
      const quotaLike = ((r.tokens?.weighted ?? 0) < 1 || (r.wallSec ?? 0) < 30);
      if (infra && quotaLike) { ex('Q', 'failed/error + chứng cứ hạn mức/hạ tầng + token≈0 hoặc wallSec ngắn'); continue; }
      const timeout = (r.wallSec ?? 0) >= 0.98 * timeoutMin * 60;
      if (timeout && infra) { ex('T', 'timeout do hạ tầng (wallSec >= 98 % hạn + chứng cứ hạ tầng)'); continue; }
      if (timeout) flags.tKeep++; else flags.n1Keep++; // T-giữ / N1: là kết quả, giữ
      kept.push(r); continue;
    }
    if (r.status !== 'done') { ex('E4', `status lạ: ${r.status}`); continue; }
    if (!Number.isFinite(r.score)) { ex('E4', 'status done nhưng thiếu score'); continue; }
    if ((r.wallSec ?? 0) >= 0.98 * timeoutMin * 60) flags.doneNearTimeout++;
    if ((r.tokens?.weighted ?? 0) < 1) flags.doneZeroTokens++;
    kept.push(r);
  }
  return { kept, excluded, flags };
}

// ---------- TOST trên log-tỉ số (SR-04) ----------
/** cellsA, cellsB: mảng theo bài, mỗi phần tử là mảng giá trị lượt. Thống kê: TB theo bài của log(TB(B)/TB(A)). */
export function bootstrapRatio(cellsA, cellsB, { reps = B, seed = SEED, margin = MARGIN, level = 0.9 } = {}) {
  const T = cellsA.length;
  const ok = T > 0 && cellsA.every((c) => c.length) && cellsB.every((c) => c.length);
  if (!ok) return { n: 0, status: 'thiếu dữ liệu' };
  const lr = (a, b) => Math.log(mean(b) / mean(a));
  const est = mean(cellsA.map((_, t) => lr(cellsA[t], cellsB[t])));
  const rnd = rng(seed), boots = [];
  let invalid = 0;
  for (let i = 0; i < reps; i++) {
    let s = 0;
    for (let j = 0; j < T; j++) { const t = Math.floor(rnd() * T); s += lr(resample(cellsA[t], rnd), resample(cellsB[t], rnd)); }
    const v = s / T;
    if (Number.isFinite(v)) boots.push(v); else invalid++;
  }
  if (!Number.isFinite(est) || invalid > 0 || boots.length === 0) return { n: T, est: Math.exp(est), invalid, status: 'log không xác định (TB = 0)', degenerate: true };
  boots.sort((x, y) => x - y);
  const al = (1 - level) / 2;
  const lo = boots[Math.floor(al * boots.length)], hi = boots[Math.min(boots.length - 1, Math.floor((1 - al) * boots.length))];
  const degenerate = boots[boots.length - 1] - boots[0] < 1e-12;
  const [m0, m1] = margin.map(Math.log);
  const pLow = (boots.filter((x) => x <= m0).length + 1) / (boots.length + 1);
  const pUp = (boots.filter((x) => x >= m1).length + 1) / (boots.length + 1);
  return { n: T, est: Math.exp(est), lo: Math.exp(lo), hi: Math.exp(hi), p: degenerate ? NaN : Math.max(pLow, pUp), degenerate, invalid };
}

/** Ba trạng thái §2.4: 'xác nhận' (CI trong biên) | 'bác bỏ' (CI hoàn toàn ngoài một phía) | 'không kết luận'. */
export function tostVerdict(res, margin = MARGIN) {
  if (!res || !Number.isFinite(res.lo) || !Number.isFinite(res.hi)) return 'không kết luận';
  if (res.lo > margin[1] || res.hi < margin[0]) return 'bác bỏ';
  if (res.lo >= margin[0] && res.hi <= margin[1]) return res.degenerate ? 'không kết luận' : 'xác nhận';
  return 'không kết luận';
}

/** Quy tắc trần §2.7 cho (c): bỏ bài mà mọi lượt cả hai arm >= CEIL; < MIN_TASKS_C bài còn lại hoặc suy biến => không kết luận. */
export function tostScoreWithCeiling(taskIds, cellsA, cellsB, opts = {}) {
  const ceil = taskIds.map((_, t) => [...cellsA[t], ...cellsB[t]].every((x) => x >= CEIL));
  const keep = taskIds.map((_, t) => t).filter((t) => !ceil[t]);
  const ceilingTasks = taskIds.filter((_, t) => ceil[t]);
  const res = keep.length ? bootstrapRatio(keep.map((t) => cellsA[t]), keep.map((t) => cellsB[t]), opts) : { n: 0, status: 'mọi bài chạm trần' };
  let verdict = tostVerdict(res);
  let reason = '';
  if (keep.length < MIN_TASKS_C) { verdict = 'không kết luận'; reason = `trần: còn ${keep.length} bài không chạm trần (< ${MIN_TASKS_C})`; }
  else if (res.degenerate) { verdict = 'không kết luận'; reason = 'phân phối bootstrap suy biến, p = NA'; }
  return { ...res, verdict, reason, ceilingTasks, keptTasks: keep.map((t) => taskIds[t]), allPoints: taskIds.length };
}

/** IUT: B-01 chỉ xác nhận khi cả ba xác nhận; bác bỏ nếu bất kỳ phép nào bác bỏ; còn lại không kết luận. */
export function iut(verdicts) {
  if (verdicts.every((v) => v === 'xác nhận')) return 'xác nhận';
  if (verdicts.some((v) => v === 'bác bỏ')) return 'bác bỏ';
  return 'không kết luận';
}

// ---------- dữ liệu ----------
const T5 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const val = (r, m) => (m === 'weighted' ? r.tokens?.weighted ?? 0 : m === 'wallSec' ? r.wallSec ?? 0 : r.score);
const sel = (R, p) => R.filter(p);
const cells = (R, arm, tasks, metric, repOk = () => true) => tasks.map((t) => R.filter((r) => r.arm === arm && r.task === t && repOk(r.rep)).map((r) => val(r, metric)));

function b01(R, labelA, repsA, repsB, extra = {}) {
  const A = (m) => cells(R, 'A0-sonnet', T5, m, repsA.test), Bc = (m) => cells(R, 'B7', T5, m, repsB.test);
  const a = bootstrapRatio(A('weighted'), Bc('weighted'));
  const b = bootstrapRatio(A('wallSec'), Bc('wallSec'));
  const c = tostScoreWithCeiling(T5, A('score'), Bc('score'));
  const va = tostVerdict(a), vb = tostVerdict(b);
  const abs = mean(T5.map((_, t) => mean(Bc('score')[t]) - mean(A('score')[t])));
  return { label: labelA, a, b, c, va, vb, vc: c.verdict, concl: iut([va, vb, c.verdict]), absScore: abs, nA: A('score').map((x) => x.length), nB: Bc('score').map((x) => x.length) };
}
const inRange = (lo, hi) => ({ test: (r) => r >= lo && r <= hi });

// ---------- H5 ----------
export function h5Pair(R, base, treat, tasks, { reps = B, seed = SEED } = {}) {
  const A = (m) => cells(R, base, tasks, m), Tt = (m) => cells(R, treat, tasks, m);
  const ratios = (m, ca, cb) => ca.map((x, t) => median(cb[t]) / median(x));
  const tr = ratios('weighted', A('weighted'), Tt('weighted')), wr = ratios('wallSec', A('wallSec'), Tt('wallSec'));
  const aligned = tasks.map((_, t) => Number.isFinite(tr[t]) && Number.isFinite(wr[t]));
  const pass = tasks.filter((_, t) => aligned[t] && tr[t] >= 3 && wr[t] >= 1.5).length;
  // công thức nguyên văn analyze.mjs:81-83 (lọc riêng từng chuỗi, chỉ số lệch nếu có NaN)
  const trF = tr.filter(Number.isFinite), wrF = wr.filter(Number.isFinite);
  const passAnalyze = trF.filter((x, i) => x >= 3 && (wrF[i] ?? 0) >= 1.5).length;
  const rnd = rng(seed), bt = [], bw = [];
  const ca = A('weighted'), cb = Tt('weighted'), wa = A('wallSec'), wb = Tt('wallSec');
  for (let i = 0; i < reps; i++) {
    const rt = [], rw = [];
    for (let j = 0; j < tasks.length; j++) {
      const t = Math.floor(rnd() * tasks.length);
      rt.push(median(resample(cb[t], rnd)) / median(resample(ca[t], rnd)));
      rw.push(median(resample(wb[t], rnd)) / median(resample(wa[t], rnd)));
    }
    bt.push(median(rt.filter(Number.isFinite))); bw.push(median(rw.filter(Number.isFinite)));
  }
  const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  return {
    tasks: tasks.length, tokMed: median(trF), tokCI: [q(bt, 0.025), q(bt, 0.975)], wallMed: median(wrF), wallCI: [q(bw, 0.025), q(bw, 0.975)],
    pass, passShare: pass / Math.max(1, tasks.filter((_, t) => aligned[t]).length), passAnalyze, passShareAnalyze: passAnalyze / Math.max(1, trF.length),
    nAligned: aligned.filter(Boolean).length, perTask: tasks.map((t, i) => ({ task: t, tok: tr[i], wall: wr[i] })),
  };
}

// ---------- hash ----------
const norm = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
export const sha256 = (buf) => crypto.createHash('sha256').update(norm(buf)).digest('hex');
export const gitBlob = (buf) => { const n = norm(buf); return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${n.length}\0`), n])).digest('hex'); };

// ---------- báo cáo ----------
const taskList = (R) => [...new Set(R.map((r) => r.task))].sort();
const row = (...c) => `| ${c.join(' | ')} |`;
const ci = (lo, hi) => `[${f(lo, 2)}; ${f(hi, 2)}]`;

export function buildReport({ runsBuf, scriptBuf, commit1, rows }) {
  const out = [];
  const log = (s = '') => out.push(s);
  const cfgTimeout = 20;
  const finalText = (r) => { try { return fs.readFileSync(path.join(DATA, 'artifacts', r.key, '_FINAL.txt'), 'utf8'); } catch { return ''; } };
  const { kept, excluded, flags } = classifyRows(rows, { timeoutMin: cfgTimeout, finalText });
  const R = kept.map((r) => ({ ...r, win: windowOf(r) }));

  log('# Bảng số vòng 3, gói 3 (sinh bởi `docs/research/analysis/prereg-tests.mjs`; không sửa tay)');
  log();
  log('> Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Mọi số trong tệp này do script sinh; `--check` so lại với đầu ra script.');
  log();
  log('## 0. Nhận dạng phiên chạy');
  log();
  log(row('Mục', 'Giá trị'));
  log(row('---', '---'));
  log(row('Script', SCRIPT_VERSION));
  log(row('Hash commit 1 (script + test + quy tắc loại, trước khi có tệp này)', commit1 ? `\`${commit1}\`` : '(chưa ghi)'));
  log(row('sha256 `prereg-tests.mjs` (xuống dòng LF)', `\`${sha256(scriptBuf)}\``));
  log(row('Hash git (blob) `runs.jsonl`', `\`${gitBlob(runsBuf)}\``));
  log(row('sha256 `runs.jsonl`', `\`${sha256(runsBuf)}\``));
  log(row('Hạt, số mẫu bootstrap', `${SEED}, B = ${B} (hai tầng: lấy lại bài rồi lấy lại lượt trong ô; khớp \`compare\` của analyze.mjs)`));
  log(row('CI / biên', `B-01: CI 90 % phân vị, biên [${f(MARGIN[0], 2)}; ${f(MARGIN[1], 2)}]; H5: CI 95 % phân vị`));
  log(row('Số dòng đọc', `${rows.length}`));
  log();
  log('Ghi chú giờ: tệp `runs.jsonl` được commit sau khi dữ liệu W1–B7a đã có; script và hash này được ghi sau khi dữ liệu đã có (xem §9 `preregistration.md`, do hạng mục S2 ghi). Không có ngày ghi lùi.');
  log();

  // ---- 1. loại lượt
  log('## 1. Loại lượt (§4.1, §4.3: Q, L, T, E1, E4)');
  log();
  log('Cờ tính tự động từ `status`, `leak`, `error`, `_FINAL.txt` (nếu có), `wallSec` so với hạn 20 phút (`--timeout 20`, mọi `config-*.json`). Không dùng `score`.');
  log();
  log(row('Cửa sổ', 'Server', 'Dòng đọc', 'Theo RUNLOG', 'done', 'Bị loại', 'Dòng RUNLOG'));
  log(row('---', '---', '---:', '---:', '---:', '---:', '---'));
  for (const w of WINDOWS) {
    const rr = rows.filter((r) => windowOf(r) === w.id);
    log(row(w.id, w.server, rr.length, w.expected, rr.filter((r) => r.status === 'done').length, excluded.filter((e) => e.window === w.id).length, w.runlog));
  }
  log();
  log(`Số lượt bị loại: **${excluded.length}**. Giữ lại để phân tích: ${R.length}. Cờ giám sát: lượt \`failed\` giữ vì hết giờ không có chứng cứ hạ tầng (T-giữ) ${flags.tKeep}; \`failed\`/\`error\` giữ như kết quả (N1) ${flags.n1Keep}; lượt \`done\` có wallSec ≥ 98 % hạn ${flags.doneNearTimeout}; lượt \`done\` có token có trọng số ≈ 0 ${flags.doneZeroTokens}.`);
  if (!excluded.length) log('Không có dòng nào thỏa tiêu chí Q, L, T, E1, E4 ⇒ không cần lượt thay (§4.1) và mọi ô giữ nguyên số lượt đã chạy.');
  log();

  // ---- 2. B-01
  const sameWindowA = inRange(4, 9), allReps = inRange(1, 9), pooledA = inRange(1, 9);
  const prim = b01(R, 'Chính: A0 cùng cửa sổ B7a (r4–9) so với B7 r1–9', sameWindowA, allReps);
  const pooled = b01(R, 'Độ nhạy 1: A0 gộp W2b + B7a (r1–9)', pooledA, allReps);
  const matched = b01(R, 'Độ nhạy 2: chỉ lượt r4–9 cho cả hai arm', sameWindowA, inRange(4, 9));
  const tab = (x) => {
    log(`### ${x.label}`);
    log();
    log(`Cỡ ô A0 theo bài t1–t5: ${x.nA.join('/')}; B7: ${x.nB.join('/')}.`);
    log();
    log(row('Phép', 'R = B7/A0 (mũ của TB log-tỉ số)', 'CI 90 %', 'p bootstrap (xấp xỉ)', 'Kết luận'));
    log(row('---', '---:', '---', '---:', '---'));
    log(row('(a) token có trọng số', f(x.a.est), ci(x.a.lo, x.a.hi), f(x.a.p, 4), x.va));
    log(row('(b) thời gian thực', f(x.b.est), ci(x.b.lo, x.b.hi), f(x.b.p, 4), x.vb));
    log(row('(c) điểm (có trần §2.7)', f(x.c.est), ci(x.c.lo, x.c.hi), f(x.c.p, 4), `${x.vc}${x.c.reason ? ` (${x.c.reason})` : ''}`));
    log();
    log(`(c): bài chạm trần (mọi lượt cả hai arm ≥ ${CEIL}) bị bỏ: ${x.c.ceilingTasks.join(', ') || 'không có'}; bài còn lại: ${x.c.keptTasks.join(', ') || 'không có'}. Δ điểm tuyệt đối (B7 − A0, TB theo bài, mọi 5 bài, báo kèm theo §3.2): ${(x.absScore * 100).toFixed(2).replace('.', ',')} pp.`);
    log(`**B-01 (IUT ba phép): ${x.concl}.**`);
    log();
  };
  log('## 2. B-01 (§3.2): B7 (làn đơn) so với A0-sonnet trên t1–t5');
  log();
  log('Chỉ số đo bằng token có trọng số, không có độ nhạy USD (SR-02 chưa xong). Server nhánh `7fb18ba` cho cả hai arm. p bootstrap = (k + 1)/(B + 1), xấp xỉ, chỉ kèm theo; phán quyết theo CI (§2.4).');
  log();
  tab(prim); tab(pooled); tab(matched);
  log('So sánh trạng thái giữa bản chính và độ nhạy: ' + [prim, pooled, matched].map((x) => x.concl).join(' / ') + (new Set([prim, pooled, matched].map((x) => x.concl)).size === 1 ? ' (giống nhau).' : ' (**khác nhau**: kết luận lấy bản chính, báo cả hai).'));
  log();
  log('Điểm theo bài, A0 ở hai cửa sổ (kiểm tính tương thích để gộp, mô tả):');
  log();
  log(row('Bài', 'A0 W2b (r1–3) TB', 'A0 B7a (r4–9) TB', 'B7 (r1–9) TB'));
  log(row('---', '---:', '---:', '---:'));
  for (const t of T5) {
    const m = (arm, win) => mean(R.filter((r) => r.arm === arm && r.task === t && r.win === win).map((r) => r.score));
    log(row(t, f(m('A0-sonnet', 'W2b'), 4), f(m('A0-sonnet', 'B7a'), 4), f(m('B7', 'B7a'), 4)));
  }
  log();

  // ---- 3. H5
  log('## 3. H5 (chi phí): cặp cùng cửa sổ');
  log();
  log('Tỉ số trung vị theo bài của token có trọng số và wallSec (treatment/baseline), CI 95 % hai tầng (B = 4000, hạt 20261102). "Đạt ngưỡng": bài có token ≥ 3× **và** thời gian ≥ 1,5×. Cột "analyze.mjs" lặp công thức nguyên văn (`:81-83`, lọc riêng từng chuỗi); cột "ghép theo bài" là bản đã sửa lệch chỉ số (SR-06). Ngưỡng 3×/1,5× là của H5 (B0/A0); với B6, B7 chỉ mô tả. **B0 chạy trên `main` e0bd2f4, B6/B7 trên nhánh `7fb18ba`: không so chéo hai server.**');
  log();
  const pairs = [
    ['W1', 'B0', 'A0-sonnet', (r) => r.win === 'W1'], ['W2a', 'B0', 'A0-sonnet', (r) => r.win === 'W2a'], ['W2c (s1 r4–10)', 'B0', 'A0-sonnet', (r) => r.win === 'W2c'],
    ['W2b', 'B6', 'A0-sonnet', (r) => r.win === 'W2b'], ['B7a (chính: A0 r4–9)', 'B7', 'A0-sonnet', (r) => r.win === 'B7a'],
  ];
  log(row('Cặp', 'Số bài', 'Token trung vị (CI 95 %)', 'Thời gian trung vị (CI 95 %)', 'Đạt ngưỡng (ghép theo bài)', 'Đạt ngưỡng (analyze.mjs)'));
  log(row('---', '---:', '---', '---', '---', '---'));
  const h5rows = [];
  for (const [lab, tr, base, p] of pairs) {
    const Rw = R.filter((r) => p(r));
    const h = h5Pair(Rw, base, tr, taskList(Rw));
    h5rows.push([lab, tr, h]);
    log(row(`${lab}: ${tr}/${base}`, h.tasks, `×${f(h.tokMed, 2)} ${ci(h.tokCI[0], h.tokCI[1])}`, `×${f(h.wallMed, 2)} ${ci(h.wallCI[0], h.wallCI[1])}`, `${h.pass}/${h.nAligned} = ${pct(h.passShare, 0)}`, `${h.passAnalyze}/${h.nAligned} = ${pct(h.passShareAnalyze, 0)}`));
  }
  const pooledH = h5Pair(R.filter((r) => r.win === 'B7a' || (r.win === 'W2b' && r.arm === 'A0-sonnet')), 'A0-sonnet', 'B7', T5);
  log(row('Độ nhạy B7a: A0 gộp r1–9 (W2b + B7a)', pooledH.tasks, `×${f(pooledH.tokMed, 2)} ${ci(pooledH.tokCI[0], pooledH.tokCI[1])}`, `×${f(pooledH.wallMed, 2)} ${ci(pooledH.wallCI[0], pooledH.wallCI[1])}`, `${pooledH.pass}/${pooledH.nAligned} = ${pct(pooledH.passShare, 0)}`, `${pooledH.passAnalyze}/${pooledH.nAligned} = ${pct(pooledH.passShareAnalyze, 0)}`));
  log();
  log('Tỉ số theo bài (token ; thời gian):');
  log();
  for (const [lab, tr, h] of h5rows) log(`- ${lab} ${tr}: ` + h.perTask.map((x) => `${x.task} ×${f(x.tok, 2)} ; ×${f(x.wall, 2)}`).join(' · '));
  log();
  log('Ghi chú: W2c chỉ có 1 bài (s1), nên CI chỉ phản ánh lấy lại lượt trong ô, không có biến thiên giữa bài. W1 gồm s1 r1–3 và W2c gồm s1 r4–10, tách theo cửa sổ.');
  log();

  // ---- 4. mô tả
  log('## 4. Mô tả (không xác nhận)');
  log();
  log('### 4.1 Điểm theo bài và theo arm (TB ± sd; số lượt; nhỏ nhất)');
  log();
  const groups = [['W1', 'A0-sonnet'], ['W1', 'B0'], ['W2a', 'A0-sonnet'], ['W2a', 'B0'], ['W2b', 'A0-sonnet'], ['W2b', 'B6'], ['W2c', 'A0-sonnet'], ['W2c', 'B0'], ['B7a', 'A0-sonnet'], ['B7a', 'B7']];
  log(row('Cửa sổ', 'Arm', 'Bài', 'n', 'Điểm TB', 'sd', 'Nhỏ nhất', 'Token có trọng số (trung vị)', 'Thời gian s (trung vị)'));
  log(row('---', '---', '---', '---:', '---:', '---:', '---:', '---:', '---:'));
  for (const [w, a] of groups) for (const t of taskList(R.filter((r) => r.win === w))) {
    const rr = R.filter((r) => r.win === w && r.arm === a && r.task === t);
    if (!rr.length) continue;
    log(row(w, a, t, rr.length, f(mean(rr.map((r) => r.score)), 4), f(sd(rr.map((r) => r.score)), 4), f(Math.min(...rr.map((r) => r.score)), 4), Math.round(median(rr.map((r) => r.tokens?.weighted ?? 0))).toLocaleString('vi-VN'), Math.round(median(rr.map((r) => r.wallSec ?? 0)))));
  }
  log();
  log('Điểm theo arm (mọi bài, mọi cửa sổ; không so chéo vì bài khác nhau):');
  log();
  log(row('Arm', 'Lượt', 'Điểm TB', 'Token có trọng số TB', 'Thời gian s (trung vị)'));
  log(row('---', '---:', '---:', '---:', '---:'));
  for (const a of ['A0-sonnet', 'B0', 'B6', 'B7']) {
    const rr = R.filter((r) => r.arm === a);
    log(row(a, rr.length, f(mean(rr.map((r) => r.score)), 4), Math.round(mean(rr.map((r) => r.tokens?.weighted ?? 0))).toLocaleString('vi-VN'), Math.round(median(rr.map((r) => r.wallSec ?? 0)))));
  }
  log();
  log('### 4.2 Làn nhanh (B6), làn đơn (B7), B0 trên t1–t5');
  log();
  log('**B0 không chạy t1–t5; không có so sánh B0 với B6/B7 trên cùng bài. B0 ở server `main`, B6/B7 ở nhánh `7fb18ba`.** Tỉ số dưới đây là mô tả (TB theo bài của log-tỉ số, CI 90 % hai tầng, B = 4000): B6/A0 trong W2b (r1–3), B7/A0 trong B7a (A0 r4–9), và B7/B6 (khác cửa sổ, chung server).');
  log();
  log(row('Cặp', 'Chỉ số', 'R', 'CI 90 %'));
  log(row('---', '---', '---:', '---'));
  const ra = (arm, win, m) => cells(R.filter((r) => r.win === win), arm, T5, m);
  const desc = [['B6/A0 (W2b)', ra('A0-sonnet', 'W2b', 'weighted'), ra('B6', 'W2b', 'weighted'), 'token'], ['B6/A0 (W2b)', ra('A0-sonnet', 'W2b', 'wallSec'), ra('B6', 'W2b', 'wallSec'), 'thời gian'],
    ['B7/A0 (B7a)', ra('A0-sonnet', 'B7a', 'weighted'), ra('B7', 'B7a', 'weighted'), 'token'], ['B7/A0 (B7a)', ra('A0-sonnet', 'B7a', 'wallSec'), ra('B7', 'B7a', 'wallSec'), 'thời gian'],
    ['B7/B6 (khác cửa sổ)', ra('B6', 'W2b', 'weighted'), ra('B7', 'B7a', 'weighted'), 'token'], ['B7/B6 (khác cửa sổ)', ra('B6', 'W2b', 'wallSec'), ra('B7', 'B7a', 'wallSec'), 'thời gian']];
  for (const [lab, ca, cb, m] of desc) { const x = bootstrapRatio(ca, cb); log(row(lab, m, f(x.est, 2), ci(x.lo, x.hi))); }
  log();
  log(row('Arm (t1–t5)', 'Điểm TB theo bài (t1…t5)', 'TB'));
  log(row('---', '---', '---:'));
  for (const [a, w] of [['A0-sonnet', 'W2b'], ['B6', 'W2b'], ['A0-sonnet', 'B7a'], ['B7', 'B7a']]) {
    const ms = T5.map((t) => mean(R.filter((r) => r.win === w && r.arm === a && r.task === t).map((r) => r.score)));
    log(row(`${a} (${w})`, ms.map((x) => f(x, 4)).join(' · '), f(mean(ms), 4)));
  }
  log();

  // ---- 5. H3, H6, H7, Holm
  log('## 5. H3, H6, H7 và họ Holm (§2.5, §3.1)');
  log();
  const nCell = (arm, task) => R.filter((r) => r.arm === arm && r.task === task).length;
  const s1a = nCell('A0-sonnet', 's1-sec-review'), s1b = nCell('B0', 's1-sec-review');
  const armsPresent = new Set(R.map((r) => r.arm));
  const h7ok = taskList(R).filter((t) => nCell('A0-sonnet', t) >= 5 && nCell('B0', t) >= 5);
  log(row('Giả thuyết', 'Cần (§3.1)', 'Hiện có', 'Trạng thái'));
  log(row('---', '---', '---', '---'));
  log(row('H3 (review, s1)', 'r = 10 mỗi arm (A0-sonnet, B0)', `s1: A0-sonnet ${s1a}, B0 ${s1b}`, s1a >= 10 && s1b >= 10 ? '**Đủ N nhưng không tính p**: SR-26 chưa có; phương án lùi §2.5 hạ H3 xuống ước lượng kèm CI (không phán Holm)' : '**chưa đủ N**'));
  log(row('H6 (A1/A2 ≈ B0)', 'A1 r = 3, A2 r = 2 trên l1-modules, l2-chain, t1–t5', `arm có mặt: ${[...armsPresent].join(', ')}; không có A1, A2`, '**chưa đủ N**, không tính p'));
  log(row('H7 (SD B0/A0 ≤ 0,7)', 'r = 5 mỗi ô, ≥ 3 bài', `bài có r ≥ 5 ở cả A0-sonnet và B0: ${h7ok.join(', ') || 'không có'} (${h7ok.length} bài)`, h7ok.length >= 3 ? 'đủ N (không tính trong vòng này)' : '**chưa đủ N**, không tính p'));
  log();
  log('**Họ Holm {H3, H6}: rỗng (K = 0).** SR-26 chưa có mã (H3, H6 hạ xuống ước lượng), H6 còn thiếu A1/A2 và t1–t5 không chạy ở các arm đó. Không giả thuyết nào được gọi "xác nhận" bằng Holm trong vòng này (§2.5).');
  log();
  const s1 = (arm) => R.filter((r) => r.arm === arm && r.task === 's1-sec-review');
  const bs = (g, h) => { // ước lượng mô tả của H3: hiệu TB (B0 − A0), CI 90 % lấy lại lượt trong ô
    const A = s1('A0-sonnet').map(g).filter(Number.isFinite), Bz = s1('B0').map(g).filter(Number.isFinite);
    const rnd = rng(SEED), v = [];
    for (let i = 0; i < B; i++) v.push(mean(resample(Bz, rnd)) - mean(resample(A, rnd)));
    v.sort((x, y) => x - y);
    return `${(100 * (mean(Bz) - mean(A))).toFixed(1).replace('.', ',')} pp [${(100 * v[Math.floor(0.05 * B)]).toFixed(1).replace('.', ',')}; ${(100 * v[Math.floor(0.95 * B)]).toFixed(1).replace('.', ',')}] (n ${A.length}/${Bz.length})`;
  };
  log('Ước lượng mô tả cho H3 trên s1 (B0 − A0-sonnet; không có p; cả hai cửa sổ W1 r1–3 và W2c r4–10, cùng server `main`):');
  log();
  log(`- recall: ${bs((r) => r.details?.recall)}`);
  log(`- precision: ${bs((r) => r.details?.precision)}`);
  log();
  log('## 6. Giới hạn của bảng này');
  log();
  log('- Các arm chạy ở cửa sổ khác nhau, hai server khác phiên bản; không có ngẫu nhiên hóa chéo cửa sổ.');
  log('- A0-sonnet cùng cửa sổ B7a chỉ có 6 lượt mỗi ô (đăng ký 9); bản gộp có 9 lượt mỗi ô nhưng A0 r1–3 chạy ở W2b.');
  log('- p bootstrap là xấp xỉ; phán quyết dùng CI (§2.4). Trần (c) theo quy tắc mức lượt, áp trên dữ liệu xác nhận vì không có pilot cho t1–t5 (khác chữ §2.7: "chỉ bằng pilot"); đây là sai lệch cần S2 ghi ở §9.');
  log('- Cờ L chỉ loại theo `leak`, chưa kiểm tay (không có dòng nào).');
  return { md: out.join('\n') + '\n', excluded, results: { prim, pooled, matched } };
}

export function excludedCsv(excluded) {
  const head = 'run_id,window,arm,task,rep,tiêu_chí,lý_do,dòng_nguồn_RUNLOG';
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const body = excluded.map((e) => [e.row.key, e.window, e.row.arm, e.row.task, e.row.rep, e.code, q(e.reason), e.runlog].join(','));
  const note = excluded.length ? [] : ['# 0 lượt bị loại: không dòng nào trong runs.jsonl thỏa Q, L, T, E1, E4 (xem round3-tables.md §1).'];
  return [head, ...body, ...note].join('\n') + '\n';
}

// ---------- CLI ----------
function main(argv) {
  const flag = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
  const runsBuf = fs.readFileSync(path.join(DATA, 'runs.jsonl'));
  const scriptBuf = fs.readFileSync(fileURLToPath(import.meta.url));
  const rows = runsBuf.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const tablesPath = path.join(HERE, 'round3-tables.md'), csvPath = path.join(HERE, 'excluded-round3.csv');
  if (argv.includes('--check')) {
    const target = path.resolve(flag('check') ?? tablesPath);
    const existing = fs.readFileSync(target, 'utf8');
    const m = existing.match(/Hash commit 1[^|]*\| `([0-9a-f]{7,40})`/);
    const { md, excluded } = buildReport({ runsBuf, scriptBuf, commit1: m?.[1], rows });
    const cmp = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
    let ok = cmp(existing, md);
    const csvFile = path.join(path.dirname(target), 'excluded-round3.csv');
    if (fs.existsSync(csvFile)) ok = ok && cmp(fs.readFileSync(csvFile, 'utf8'), excludedCsv(excluded));
    console.log(ok ? `OK: ${path.relative(process.cwd(), target)} và excluded-round3.csv trùng đầu ra script.` : `LỆCH: ${target} không trùng đầu ra script (hash script, dữ liệu hoặc quy tắc đã đổi).`);
    process.exit(ok ? 0 : 1);
  }
  const commit1 = flag('commit1');
  const { md, excluded } = buildReport({ runsBuf, scriptBuf, commit1, rows });
  if (argv.includes('--write')) {
    if (!commit1) { console.error('Thiếu --commit1 <hash> (hash commit chứa script, test, quy tắc loại).'); process.exit(2); }
    fs.writeFileSync(tablesPath, md); fs.writeFileSync(csvPath, excludedCsv(excluded));
    console.log(`Đã ghi ${tablesPath} và ${csvPath} (${excluded.length} lượt bị loại).`);
  } else process.stdout.write(md);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
