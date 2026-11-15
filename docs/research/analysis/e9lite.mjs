#!/usr/bin/env node
// E9-lite [Khám phá] (BRIEF-24 K2): phân tích mô tả runs.jsonl của ba arm planner P-H/P-S/P-O.
// Luật khớp, thước đo, bootstrap: chép từ docs/research/preregistration.md §9 mục "Sai lệch E9 → E9-lite" (5)(6)(7).
// Chỉ đọc các trường: key/task/arm/rep, status, error, planRaw, planFinal[].files, planGate, replanCount, usage.tokens, planModel.match, authSource, configHash, ccodingCommit, claudeCliVersion.
// Dùng: node docs/research/analysis/e9lite.mjs --runs <runs.jsonl> --gold <gold.json> --labels <labels.json> [--seed 20261115] [--tasks-dir bench/vs-claude/tasks] [--boot 4000]
// Chưa có runs.jsonl (hoặc rỗng) ⇒ không in bảng, exit 0. Cờ dừng ⇒ exit 3, không in bảng.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, mod2Of } from './e9lite-labels.mjs';

export const ARMS = ['P-H', 'P-S', 'P-O'];
export const CONTRASTS = [['P-O', 'P-S', 'Opus − Sonnet'], ['P-H', 'P-S', 'Haiku − Sonnet']];
export const DEFAULT_SEED = 20261115;
export const DEFAULT_BOOT = 4000;

// ---- luật khớp tệp (tất định) ----
export function normPath(p, taskId, repoDir = 'starter') {
  let s = String(p ?? '').replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  for (const pre of [`${taskId}/${repoDir}/`, `${repoDir}/`]) {
    if (s.startsWith(pre)) { s = s.slice(pre.length); break; }
  }
  return s;
}
export const moduleOf = (p) => { const i = p.indexOf('/'); return i < 0 ? '.' : p.slice(0, i); };

/** Hợp files của mọi hạng mục, đã chuẩn hóa. */
export function planFiles(plan, taskId, repoDir) {
  const out = new Set();
  for (const it of plan ?? []) for (const f of it?.files ?? []) out.add(normPath(f, taskId, repoDir));
  return out;
}

/** Độ phủ chuẩn ∩ kế hoạch / chuẩn. Chuẩn rỗng ⇒ null (NA). */
export function coverage(goldSet, planSet) {
  if (goldSet.size === 0) return null;
  let n = 0; for (const g of goldSet) if (planSet.has(g)) n++;
  return n / goldSet.size;
}

export const weighted = (t) => (t ? Math.round((t.input ?? 0) + 1.25 * (t.cacheWrite ?? 0) + 0.1 * (t.cacheRead ?? 0) + 5 * (t.output ?? 0)) : null);

/** Cổng đạt lần đầu — theo khối "Đính chính gateFirst" (§9, BRIEF-24b K2). Trả 0 hoặc 1, không bao giờ null.
 *  planGate không phải đối tượng ⇒ 0; planGate.replanned === true ⇒ 0; còn lại 1 ⇔ replanCount === 0. `ok`, rules, uncovered, reasons không tham gia. */
export function gateFirst(row) {
  const g = row.planGate;
  if (g == null || typeof g !== 'object') return 0;
  if (g.replanned === true) return 0;
  return row.replanCount === 0 ? 1 : 0;
}
/** Bộ đếm báo riêng cho gateFirst, trên các dòng đã chọn. */
export function gateCounters(kept) {
  let nGateNull = 0, nReplanCountMissing = 0, nReplanned = 0;
  for (const r of kept) {
    if (r.planGate == null || typeof r.planGate !== 'object') nGateNull++;
    else if (r.planGate.replanned === true) nReplanned++;
    if (typeof r.replanCount !== 'number') nReplanCountMissing++;
  }
  return { nGateNull, nReplanCountMissing, nReplanned };
}

// ---- đọc runs.jsonl ----
export function parseRuns(text) {
  const rows = []; let malformed = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { malformed++; }
  }
  return { rows, malformed };
}
const keyOf = (r) => r.key ?? `${r.task}__${r.arm}__r${r.rep}`;

/** Chọn dòng tính: mỗi khóa chỉ dòng `done` cuối; loại model lệch (planModel.match === false). Lượt đầu (kể cả lỗi) vẫn được báo. */
export function selectRuns(rows) {
  const byKey = new Map();
  for (const r of rows) { const k = keyOf(r); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const kept = []; const firstFail = []; const mismatch = []; const noDone = [];
  for (const [k, list] of byKey) {
    const first = list[0];
    // m3: đếm MỌI dòng không phải done (hoặc model lệch) của khóa, theo arm/nguyên nhân; không chỉ lượt đầu.
    for (const r of list) if (r.status !== 'done' || r.planModel?.match === false) firstFail.push({ key: k, arm: r.arm, task: r.task, status: r.status, cause: causeOf(r) });
    for (const r of list) if (r.planModel?.match === false) mismatch.push({ key: k, arm: r.arm });
    const dones = list.filter((r) => r.status === 'done' && r.planModel?.match !== false);
    if (dones.length) kept.push(dones[dones.length - 1]); else noDone.push(k);
  }
  return { kept, firstFail, mismatch, noDone, keys: byKey.size };
}
function causeOf(r) {
  const e = String(r.error ?? '');
  if (r.planModel?.match === false || /không khớp planModel/.test(e)) return 'model-lệch';
  if (/403|rate|hạn mức|quota|ngắt|ECONN|infra/i.test(e)) return 'hạ-tầng';
  return e ? 'lỗi-khác' : (r.status ?? 'không-rõ');
}

/** Cờ dừng cả đợt (K1 mục 4 và 7). Trả mảng chuỗi; rỗng = không dừng. */
export function stopFlags(rows) {
  const flags = [];
  // M1: bỏ null (dòng lỗi hạ tầng/trước khi có lượt gọi không có authSource); chỉ dừng khi có giá trị mang dấu khóa API, hoặc lẫn nhiều giá trị khác null.
  const auth = new Set(rows.filter((r) => r.authSource != null).map((r) => String(r.authSource)));
  const apiKey = [...auth].filter((x) => /key|api/i.test(x));
  if (apiKey.length) flags.push(`authSource có khóa API: ${apiKey.join(', ')}`);
  if (auth.size > 1) flags.push(`authSource lẫn nhiều giá trị trong cùng đợt: ${[...auth].sort().join(', ')}`);
  // M2 (K2 mục 4): ccodingCommit và claudeCliVersion phải trùng ở mọi dòng; null tính là một giá trị riêng.
  for (const fld of ['ccodingCommit', 'claudeCliVersion']) {
    const v = new Set(rows.map((r) => (r[fld] == null ? 'null' : `"${r[fld]}"`)));
    if (v.size > 1) flags.push(`${fld} khác nhau giữa các dòng (null tính là một giá trị): ${[...v].sort().join(', ')}`);
  }
  const hashes = new Map();
  for (const r of rows) { if (r.configHash == null) continue; if (!hashes.has(r.arm)) hashes.set(r.arm, new Set()); hashes.get(r.arm).add(r.configHash); }
  for (const [arm, s] of hashes) if (s.size > 1) flags.push(`configHash khác nhau trong cùng arm ${arm}: ${[...s].join(', ')}`);
  // Giữa các arm configHash phải khác nhau (planModel khác); hai arm trùng băm ⇒ cấu hình không như đăng ký. Không tách được "chỉ khác planModel" từ băm.
  const per = [...hashes.entries()].filter(([, s]) => s.size === 1).map(([a, s]) => [a, [...s][0]]);
  const seen = new Map();
  for (const [a, h] of per) { if (seen.has(h)) flags.push(`arm ${a} và ${seen.get(h)} trùng configHash (planModel phải khác nhau)`); else seen.set(h, a); }
  return flags;
}

const isMockRow = (r) => /^mock-/.test(String(r.planModel?.actual ?? ''));
/** M1/M2 cảnh báo (không dừng, exit vẫn 0): authSource null ở dòng done của runtime thật; ccodingCommit/claudeCliVersion null ở mọi dòng. */
export function stopWarnings(rows) {
  const w = [];
  const nullDone = rows.filter((r) => r.status === 'done' && !isMockRow(r) && r.authSource == null);
  if (nullDone.length) w.push(`authSource null ở ${nullDone.length} dòng done (runtime thật): ${[...new Set(nullDone.map(keyOf))].sort().join(', ')}`);
  for (const fld of ['ccodingCommit', 'claudeCliVersion']) if (rows.length && rows.every((r) => r[fld] == null)) w.push(`${fld} null ở mọi dòng: đợt không ghi phiên bản`);
  return w;
}

// ---- thước đo theo lượt ----
export function rowMetrics(row, gold, label, repoDir) {
  // B1: G_f = tệp change ∈ {added, modified}; G_m suy từ G_f đó (không dùng gold.modules vì gồm module của tệp deleted).
  const cf = changedFiles(gold);
  const gf = new Set(cf.map((f) => f.path));
  const gm = new Set(cf.map((f) => f.module));
  const gm2 = new Set(cf.map((f) => mod2Of(f.path))); // độ nhạy §9 (S2)
  const m = { replanCount: typeof row.replanCount === 'number' ? row.replanCount : null, gateFirst: gateFirst(row), tokens: weighted(row.usage?.tokens) };
  for (const [name, plan] of [['raw', row.planRaw], ['final', row.planFinal]]) {
    if (plan == null && name === 'final') { m[`${name}.missing`] = 1; continue; } // planFinal vắng: loại khỏi planFinal
    const arr = Array.isArray(plan) ? plan : [];
    const pf = planFiles(arr, row.task, repoDir);
    const pm = new Set([...pf].map(moduleOf));
    m[`${name}.covFile`] = coverage(gf, pf);
    m[`${name}.covMod`] = coverage(gm, pm);
    m[`${name}.covMod2`] = coverage(gm2, new Set([...pf].map(mod2Of)));
    m[`${name}.items`] = arr.length;
    if (label === 'khong_chia_duoc') m[`${name}.overSplit`] = arr.length > 1 ? 1 : 0;
  }
  return m;
}
export const SENS_METRICS = ['raw.covMod2', 'final.covMod2', 'raw.overSplit', 'final.overSplit'];
export const METRICS = ['raw.covFile', 'raw.covMod', 'raw.covMod2', 'final.covMod2', 'raw.items', 'raw.overSplit', 'final.covFile', 'final.covMod', 'final.items', 'final.overSplit', 'replanCount', 'gateFirst', 'tokens'];

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Gộp các lượt lặp theo (bài, arm): trung bình từng thước (bỏ null). */
export function perTask(kept, goldById, labelsById, repoDirs = {}) {
  const cells = {}; // task → arm → metric → [giá trị]
  const missingFinal = {};
  for (const r of kept) {
    const g = goldById[r.task]; if (!g) continue;
    const m = rowMetrics(r, g, labelsById[r.task], repoDirs[r.task]);
    if (m['final.missing']) missingFinal[r.arm] = (missingFinal[r.arm] ?? 0) + 1;
    const c = ((cells[r.task] ??= {})[r.arm] ??= {});
    for (const k of METRICS) if (m[k] != null) (c[k] ??= []).push(m[k]);
  }
  const out = {};
  for (const [t, arms] of Object.entries(cells)) for (const [a, ms] of Object.entries(arms)) for (const [k, v] of Object.entries(ms)) ((out[t] ??= {})[a] ??= {})[k] = { mean: mean(v), reps: v.length };
  return { out, missingFinal };
}

// ---- bootstrap theo bài, seed khóa ----
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Bootstrap trung bình hiệu theo bài: rút lại n bài có hoàn lại, B lần, percentile 2,5/97,5. */
export function bootstrapMean(diffs, B = DEFAULT_BOOT, seed = DEFAULT_SEED) {
  const n = diffs.length; if (!n) return null;
  const rnd = mulberry32(seed); const means = new Array(B);
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += diffs[Math.floor(rnd() * n)]; means[b] = s / n; }
  means.sort((x, y) => x - y);
  return { mean: mean(diffs), lo: means[Math.floor(0.025 * B)], hi: means[Math.ceil(0.975 * B) - 1], n, B, seed };
}

/** Hiệu theo bài cho một thước và một cặp arm, trong tập bài `taskIds`. */
export function contrast(pt, taskIds, metric, armA, armB, { B = DEFAULT_BOOT, seed = DEFAULT_SEED } = {}) {
  const rows = [];
  for (const t of taskIds) {
    const a = pt[t]?.[armA]?.[metric]?.mean; const b = pt[t]?.[armB]?.[metric]?.mean;
    if (a != null && b != null) rows.push({ task: t, diff: a - b });
  }
  const d = rows.map((r) => r.diff);
  const res = { n: d.length, pos: d.filter((x) => x > 0).length, zero: d.filter((x) => x === 0).length, neg: d.filter((x) => x < 0).length, perTask: rows };
  if (d.length >= 3) res.boot = bootstrapMean(d, B, seed); else res.listOnly = true;
  return res;
}

export function analyze({ rows, gold, labels, seed = DEFAULT_SEED, B = DEFAULT_BOOT, repoDirs = {} }) {
  const goldById = Object.fromEntries(gold.tasks.map((t) => [t.id, t]));
  const labelsById = Object.fromEntries(Object.entries(labels.labels ?? {}).map(([k, v]) => [k, v.label ?? v]));
  const sel = selectRuns(rows);
  const flags = stopFlags(rows);
  const { out: pt, missingFinal } = perTask(sel.kept, goldById, labelsById, repoDirs);
  const tasks = Object.keys(goldById).sort();
  const strata = { all: tasks, chia_duoc: tasks.filter((t) => labelsById[t] === 'chia_duoc'), khong_chia_duoc: tasks.filter((t) => labelsById[t] === 'khong_chia_duoc') };
  const degenerate = strata.chia_duoc.length === 0 || strata.khong_chia_duoc.length === 0;
  const result = { flags, warnings: stopWarnings(rows), gate: gateCounters(sel.kept), sel, missingFinal, degenerate, perTask: pt, contrasts: {} };
  for (const [sname, ids] of Object.entries(strata)) {
    if (!ids.length) continue;
    // Phân tầng suy biến: không so sánh theo tầng (chỉ tầng "all"); chia thừa chỉ trên bài không chia được.
    if (degenerate && sname !== 'all') continue;
    for (const [A, Bm, name] of CONTRASTS) for (const metric of METRICS) {
      if (metric.endsWith('overSplit') && sname !== 'khong_chia_duoc') continue;
      const c = contrast(pt, ids, metric, A, Bm, { B, seed });
      if (c.n) (result.contrasts[sname] ??= {})[`${name}|${metric}`] = c;
    }
  }
  // Độ nhạy (§9 S2): nhãn theo mod2Of, báo song song, gắn "độ nhạy"; không thay nhãn chính.
  const labelsById2 = Object.fromEntries(Object.entries(labels.labels ?? {}).map(([k, v]) => [k, v.sensitivity?.label]));
  const { out: pt2 } = perTask(sel.kept, goldById, labelsById2, repoDirs);
  const strata2 = { all: tasks, chia_duoc: tasks.filter((t) => labelsById2[t] === 'chia_duoc'), khong_chia_duoc: tasks.filter((t) => labelsById2[t] === 'khong_chia_duoc') };
  const degenerate2 = strata2.chia_duoc.length === 0 || strata2.khong_chia_duoc.length === 0;
  result.sensitivity = { strata: Object.fromEntries(Object.entries(strata2).map(([k, v]) => [k, v.length])), degenerate: degenerate2, contrasts: {} };
  for (const [sname, ids] of Object.entries(strata2)) {
    if (!ids.length || (degenerate2 && sname !== 'all')) continue;
    for (const [A, Bm, name] of CONTRASTS) for (const metric of SENS_METRICS) {
      if (metric.endsWith('overSplit') && sname !== 'khong_chia_duoc') continue;
      const c = contrast(pt2, ids, metric, A, Bm, { B, seed });
      if (c.n) (result.sensitivity.contrasts[sname] ??= {})[`${name}|${metric}`] = c;
    }
  }
  result.strata = Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.length]));
  return result;
}

const f3 = (x) => (x == null ? 'NA' : x.toFixed(3).replace('.', ','));
export function format(res) {
  const L = [];
  L.push('E9-lite [Khám phá] — mô tả, không p-value, không Holm. n = số bài; khoảng = bootstrap theo bài 95 % percentile.');
  for (const w of res.warnings ?? []) L.push(`CẢNH BÁO: ${w}`);
  L.push('Lưu ý: kết quả chỉ nói về độ phủ theo bố cục thư mục của lời giải mẫu, không kết luận về chất lượng bóc tách.');
  L.push(`Khóa: ${res.sel.keys}; lượt tính (done cuối): ${res.sel.kept.length}; khóa không có done: ${res.sel.noDone.length}; dòng model lệch bị loại: ${res.sel.mismatch.length}.`);
  const byArm = {}; for (const f of res.sel.firstFail) { const a = (byArm[f.arm] ??= {}); a[f.cause] = (a[f.cause] ?? 0) + 1; }
  L.push(`Dòng lỗi (mọi dòng không phải done) theo arm/nguyên nhân (vẫn báo): ${JSON.stringify(byArm)}`);
  if (res.gate) L.push(`gateFirst — planGate null/không phải đối tượng: ${res.gate.nGateNull}; replanCount thiếu: ${res.gate.nReplanCountMissing}; dòng replanned: ${res.gate.nReplanned}.`);
  if (Object.keys(res.missingFinal).length) L.push(`Lượt không có planFinal (loại khỏi planFinal): ${JSON.stringify(res.missingFinal)}`);
  L.push(`Tầng: ${JSON.stringify(res.strata)}${res.degenerate ? ' — PHÂN TẦNG SUY BIẾN: không tính chia thừa, không so sánh theo tầng' : ''}`);
  const tables = [...Object.entries(res.contrasts).map(([s, cs]) => [`Tầng: ${s}`, cs])];
  if (res.sensitivity) {
    L.push(`Độ nhạy (module = mod2Of, §9 S2; không thay nhãn chính) — tầng: ${JSON.stringify(res.sensitivity.strata)}${res.sensitivity.degenerate ? ' — suy biến' : ''}`);
    for (const [s, cs] of Object.entries(res.sensitivity.contrasts)) tables.push([`Độ nhạy, tầng: ${s}`, cs]);
  }
  for (const [title, cs] of tables) {
    L.push('', `## ${title}`, '| Cặp | Thước | n | Hiệu TB | KTC 95 % | >0 / =0 / <0 |', '|---|---|---|---|---|---|');
    for (const [k, c] of Object.entries(cs)) {
      const [name, metric] = k.split('|');
      const ci = c.boot ? `[${f3(c.boot.lo)}; ${f3(c.boot.hi)}]` : `chỉ liệt kê: ${c.perTask.map((r) => `${r.task}=${f3(r.diff)}`).join(', ')}`;
      L.push(`| ${name} | ${metric} | ${c.n} | ${f3(c.boot ? c.boot.mean : mean(c.perTask.map((r) => r.diff)))} | ${ci} | ${c.pos} / ${c.zero} / ${c.neg} |`);
    }
  }
  return L.join('\n');
}

function main(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const runsPath = opt('--runs'); const goldPath = opt('--gold'); const labelsPath = opt('--labels');
  const seed = Number(opt('--seed', DEFAULT_SEED)); const B = Number(opt('--boot', DEFAULT_BOOT));
  if (!runsPath || !goldPath || !labelsPath) { console.error('Dùng: e9lite.mjs --runs <runs.jsonl> --gold <gold.json> --labels <labels.json> [--seed N] [--boot B] [--tasks-dir <dir>]'); return 2; }
  if (!existsSync(runsPath)) { console.log(`Chưa có runs.jsonl thật (${runsPath}): chưa chạy planner, không in bảng.`); return 0; }
  const { rows, malformed } = parseRuns(readFileSync(runsPath, 'utf8'));
  if (!rows.length) { console.log('runs.jsonl rỗng: chưa có lượt chạy, không in bảng.'); return 0; }
  if (malformed) console.error(`Cảnh báo: ${malformed} dòng JSON hỏng bị bỏ qua.`);
  const gold = JSON.parse(readFileSync(goldPath, 'utf8')); const labels = JSON.parse(readFileSync(labelsPath, 'utf8'));
  const tasksDir = resolve(opt('--tasks-dir', 'bench/vs-claude/tasks')); const repoDirs = {};
  for (const t of gold.tasks) { const p = join(tasksDir, t.id, 'task.json'); if (existsSync(p)) repoDirs[t.id] = JSON.parse(readFileSync(p, 'utf8')).repoDir ?? 'starter'; }
  const res = analyze({ rows, gold, labels, seed, B, repoDirs });
  if (res.flags.length) { console.log('CỜ DỪNG — dừng cả đợt, sửa rồi chạy lại từ đầu (K1 mục 7):'); for (const f of res.flags) console.log(`- ${f}`); return 3; }
  console.log(format(res));
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
