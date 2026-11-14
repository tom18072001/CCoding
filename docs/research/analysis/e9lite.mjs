#!/usr/bin/env node
// E9-lite [Khám phá] (BRIEF-24 K2): phân tích mô tả runs.jsonl của ba arm planner P-H/P-S/P-O.
// Luật khớp, thước đo, bootstrap: chép từ docs/research/preregistration.md §9 mục "Sai lệch E9 → E9-lite" (5)(6)(7).
// Chỉ đọc các trường: key/task/arm/rep, status, error, planRaw, planFinal[].files, planGate, replanCount, usage.tokens, planModel.match, authSource, configHash.
// Dùng: node docs/research/analysis/e9lite.mjs --runs <runs.jsonl> --gold <gold.json> --labels <labels.json> [--seed 20261115] [--tasks-dir bench/vs-claude/tasks] [--boot 4000]
// Chưa có runs.jsonl (hoặc rỗng) ⇒ không in bảng, exit 0. Cờ dừng ⇒ exit 3, không in bảng.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Cổng đạt lần đầu: planGate là đối tượng, không bị sửa (replanned) và replanCount không > 0. planGate null ⇒ null (không rõ). */
export function gateFirst(row) {
  if (row.planGate == null || typeof row.planGate !== 'object') return null;
  if (row.planGate.replanned === true) return 0;
  if (typeof row.replanCount === 'number' && row.replanCount > 0) return 0;
  return 1;
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
    if (first.status !== 'done' || first.planModel?.match === false) firstFail.push({ key: k, arm: first.arm, task: first.task, status: first.status, cause: causeOf(first) });
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
  const auth = new Set(rows.map((r) => (r.authSource == null ? 'null' : String(r.authSource))));
  const apiKey = [...auth].filter((a) => /key|api/i.test(a));
  if (apiKey.length) flags.push(`authSource có khóa API: ${apiKey.join(', ')}`);
  if (auth.size > 1) flags.push(`authSource lẫn nhiều giá trị trong cùng đợt: ${[...auth].sort().join(', ')}`);
  const hashes = new Map();
  for (const r of rows) { if (r.configHash == null) continue; if (!hashes.has(r.arm)) hashes.set(r.arm, new Set()); hashes.get(r.arm).add(r.configHash); }
  for (const [arm, s] of hashes) if (s.size > 1) flags.push(`configHash khác nhau trong cùng arm ${arm}: ${[...s].join(', ')}`);
  // Giữa các arm configHash phải khác nhau (planModel khác); hai arm trùng băm ⇒ cấu hình không như đăng ký. Không tách được "chỉ khác planModel" từ băm.
  const per = [...hashes.entries()].filter(([, s]) => s.size === 1).map(([a, s]) => [a, [...s][0]]);
  const seen = new Map();
  for (const [a, h] of per) { if (seen.has(h)) flags.push(`arm ${a} và ${seen.get(h)} trùng configHash (planModel phải khác nhau)`); else seen.set(h, a); }
  return flags;
}

// ---- thước đo theo lượt ----
export function rowMetrics(row, gold, label, repoDir) {
  const gf = new Set(gold.files.map((f) => f.path));
  const gm = new Set(gold.modules ?? gold.files.map((f) => f.module));
  const m = { replanCount: typeof row.replanCount === 'number' ? row.replanCount : null, gateFirst: gateFirst(row), tokens: weighted(row.usage?.tokens) };
  for (const [name, plan] of [['raw', row.planRaw], ['final', row.planFinal]]) {
    if (plan == null && name === 'final') { m[`${name}.missing`] = 1; continue; } // planFinal vắng: loại khỏi planFinal
    const arr = Array.isArray(plan) ? plan : [];
    const pf = planFiles(arr, row.task, repoDir);
    const pm = new Set([...pf].map(moduleOf));
    m[`${name}.covFile`] = coverage(gf, pf);
    m[`${name}.covMod`] = coverage(gm, pm);
    m[`${name}.items`] = arr.length;
    if (label === 'khong_chia_duoc') m[`${name}.overSplit`] = arr.length > 1 ? 1 : 0;
  }
  return m;
}
export const METRICS = ['raw.covFile', 'raw.covMod', 'raw.items', 'raw.overSplit', 'final.covFile', 'final.covMod', 'final.items', 'final.overSplit', 'replanCount', 'gateFirst', 'tokens'];

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
  const result = { flags, sel, missingFinal, degenerate, perTask: pt, contrasts: {} };
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
  result.strata = Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.length]));
  return result;
}

const f3 = (x) => (x == null ? 'NA' : x.toFixed(3).replace('.', ','));
export function format(res) {
  const L = [];
  L.push('E9-lite [Khám phá] — mô tả, không p-value, không Holm. n = số bài; khoảng = bootstrap theo bài 95 % percentile.');
  L.push(`Khóa: ${res.sel.keys}; lượt tính (done cuối): ${res.sel.kept.length}; khóa không có done: ${res.sel.noDone.length}; dòng model lệch bị loại: ${res.sel.mismatch.length}.`);
  const byArm = {}; for (const f of res.sel.firstFail) { const a = (byArm[f.arm] ??= {}); a[f.cause] = (a[f.cause] ?? 0) + 1; }
  L.push(`Lượt đầu lỗi theo arm/nguyên nhân (vẫn báo): ${JSON.stringify(byArm)}`);
  if (Object.keys(res.missingFinal).length) L.push(`Lượt không có planFinal (loại khỏi planFinal): ${JSON.stringify(res.missingFinal)}`);
  L.push(`Tầng: ${JSON.stringify(res.strata)}${res.degenerate ? ' — PHÂN TẦNG SUY BIẾN: không tính chia thừa, không so sánh theo tầng' : ''}`);
  for (const [s, cs] of Object.entries(res.contrasts)) {
    L.push('', `## Tầng: ${s}`, '| Cặp | Thước | n | Hiệu TB | KTC 95 % | >0 / =0 / <0 |', '|---|---|---|---|---|---|');
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
