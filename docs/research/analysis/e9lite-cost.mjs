#!/usr/bin/env node
// E9-lite [Khám phá, sau khi thấy dữ liệu] (BRIEF-25b K1): bảng độ phủ tuyệt đối theo arm và chi phí bằng USD.
// Mô tả theo khối §9 "Phân tích khám phá bổ sung sau phản biện E9-lite" của docs/research/preregistration.md. Không p-value.
// Chỉ import từ e9lite.mjs (chọn dòng, thước đo, bootstrap) và bench/vs-claude/lib/pricing.mjs (giá).
// Dùng: node docs/research/analysis/e9lite-cost.mjs --runs <runs.jsonl> --gold <gold.json> --labels <labels.json> --out <report-cost.md> [--tasks-dir <dir>]
// Đầu ra tất định: không có thời gian chạy, không có đường dẫn máy (chỉ in đường dẫn như đã truyền, nên truyền đường dẫn tương đối).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, DEFAULT_BOOT, DEFAULT_SEED, bootstrapMean, parseRuns, rowMetrics, selectRuns, weighted } from './e9lite.mjs';
import { PRICING_VERSION, costOf } from '../../../bench/vs-claude/lib/pricing.mjs';

export const ARM_ORDER = ['P-S', 'P-O', 'P-H']; // S, O, H
export const ARM_SHORT = { 'P-S': 'S', 'P-O': 'O', 'P-H': 'H' };
export const PRICE_SOURCE = 'bench/vs-claude/lib/pricing.mjs';
const EPS = 1e-9;

// ---- thống kê mô tả (hàm thuần) ----
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Tóm tắt một dãy theo bài: n, trung bình, trung vị, min, max, số giá trị đạt 1,0. */
export function summarize(vals) {
  const a = vals.filter((x) => x != null);
  if (!a.length) return { n: 0, mean: null, median: null, min: null, max: null, n1: 0 };
  return { n: a.length, mean: mean(a), median: median(a), min: Math.min(...a), max: Math.max(...a), n1: a.filter((x) => x >= 1 - EPS).length };
}

// ---- chi phí một dòng ----
/** USD của một dòng runs.jsonl: { low, high } theo model thực của dòng. Model lạ ⇒ null cả hai. Sonnet/Opus: low = high. */
export function rowCost(row) {
  const t = row.usage?.tokens; const model = row.planModel?.actual;
  if (!t) return { low: null, high: null };
  const high = costOf(t, model); const low = costOf(t, model, { tier: 'low' });
  return { low, high };
}
/** Token có trọng số pha plan: usage.byPhase.plan (đã có trọng số trong runs.jsonl); thiếu ⇒ null. */
export const planWeighted = (row) => (typeof row.usage?.byPhase?.plan === 'number' ? row.usage.byPhase.plan : null);

// ---- gộp theo (bài, arm) ----
/** Mỗi (bài, arm): trung bình các dòng done được chọn của các lần lặp cho covFile, covMod, items, planTok, costLow, costHigh. */
export function perTaskArm(kept, goldById, repoDirs = {}) {
  const acc = {}; // task → arm → key → []
  for (const r of kept) {
    const g = goldById[r.task]; if (!g) continue;
    const m = rowMetrics(r, g, undefined, repoDirs[r.task]);
    const c = rowCost(r);
    const vals = { covFile: m['raw.covFile'], covMod: m['raw.covMod'], items: m['raw.items'], planTok: planWeighted(r), costLow: c.low, costHigh: c.high };
    const cell = ((acc[r.task] ??= {})[r.arm] ??= {});
    for (const [k, v] of Object.entries(vals)) if (v != null) (cell[k] ??= []).push(v);
  }
  const out = {};
  for (const [t, arms] of Object.entries(acc)) for (const [a, ks] of Object.entries(arms)) for (const [k, v] of Object.entries(ks)) ((out[t] ??= {})[a] ??= {})[k] = mean(v);
  return out;
}

/** Bảng tuyệt đối: arm → metric → summarize(theo bài). */
export function absoluteTable(pt, taskIds) {
  const tbl = {};
  for (const arm of ARM_ORDER) {
    tbl[arm] = {};
    for (const k of ['covFile', 'covMod', 'items', 'planTok', 'costLow', 'costHigh']) tbl[arm][k] = summarize(taskIds.map((t) => pt[t]?.[arm]?.[k]));
  }
  return tbl;
}

/** Hiệu theo bài A − B cho một thước, kèm bootstrap B/seed khóa; đếm bài hiệu dương / bằng 0 / âm. */
export function diffStats(pt, taskIds, metric, armA, armB, { B = DEFAULT_BOOT, seed = DEFAULT_SEED } = {}) {
  const d = [];
  for (const t of taskIds) {
    const a = pt[t]?.[armA]?.[metric]; const b = pt[t]?.[armB]?.[metric];
    if (a != null && b != null) d.push(a - b);
  }
  const zero = d.filter((x) => Math.abs(x) < EPS).length;
  const res = { n: d.length, pos: d.filter((x) => x > EPS).length, zero, neg: d.filter((x) => x < -EPS).length };
  if (d.length >= 3) res.boot = bootstrapMean(d, B, seed);
  return res;
}
/** Kết luận chi phí: chỉ 'rẻ hơn'/'đắt hơn' khi khoảng tách 0; còn lại 'chưa phân biệt được'. */
export function sepFromZero(boot) {
  if (!boot) return 'chưa phân biệt được';
  if (boot.lo > 0) return 'đắt hơn';
  if (boot.hi < 0) return 'rẻ hơn';
  return 'chưa phân biệt được';
}
/** Kết luận hai bậc giá: chỉ khi cả hai bậc cùng hướng và cùng tách 0. */
export function verdictBoth(lowBoot, highBoot) {
  const a = sepFromZero(lowBoot); const b = sepFromZero(highBoot);
  return a === b && a !== 'chưa phân biệt được' ? a : 'chưa phân biệt được về chi phí bằng tiền';
}

/** Dòng không phải done (failed...): số dòng, tổng token có trọng số, USD low/high; tổng và theo arm. */
export function failedSummary(rows) {
  const f = rows.filter((r) => r.status !== 'done');
  const mk = () => ({ n: 0, weighted: 0, noUsage: 0, low: 0, high: 0 });
  const total = mk(); const byArm = {};
  for (const r of f) {
    for (const s of [total, (byArm[r.arm] ??= mk())]) {
      s.n++;
      const w = weighted(r.usage?.tokens);
      if (w == null) s.noUsage++; else s.weighted += w;
      const c = rowCost(r); s.low += c.low ?? 0; s.high += c.high ?? 0;
    }
  }
  return { total, byArm };
}

export function analyzeCost({ rows, gold, repoDirs = {}, B = DEFAULT_BOOT, seed = DEFAULT_SEED }) {
  const goldById = Object.fromEntries(gold.tasks.map((t) => [t.id, t]));
  const tasks = Object.keys(goldById).sort();
  const sel = selectRuns(rows);
  const pt = perTaskArm(sel.kept, goldById, repoDirs);
  const abs = absoluteTable(pt, tasks);
  const pairs = [['P-O', 'P-S', 'O − S'], ['P-H', 'P-S', 'H − S']];
  const covDiff = {}; const costDiff = {};
  for (const [A, Bm, name] of pairs) {
    covDiff[name] = { covFile: diffStats(pt, tasks, 'covFile', A, Bm, { B, seed }), covMod: diffStats(pt, tasks, 'covMod', A, Bm, { B, seed }) };
    costDiff[name] = { low: diffStats(pt, tasks, 'costLow', A, Bm, { B, seed }), high: diffStats(pt, tasks, 'costHigh', A, Bm, { B, seed }) };
    costDiff[name].verdict = verdictBoth(costDiff[name].low.boot, costDiff[name].high.boot);
  }
  const saturated = {};
  for (const m of ['covFile', 'covMod']) saturated[m] = ARM_ORDER.every((a) => abs[a][m].n > 0 && abs[a][m].n1 === abs[a][m].n);
  return { nTasks: tasks.length, nKept: sel.kept.length, nKeys: sel.keys, nNoDone: sel.noDone.length, abs, covDiff, costDiff, saturated, failed: failedSummary(rows), B, seed };
}

// ---- định dạng (tất định) ----
const fx = (x, d) => (x == null ? 'NA' : x.toFixed(d).replace('.', ','));
const f3 = (x) => fx(x, 3);
const usd = (x) => fx(x, 4);
const int = (x) => (x == null ? 'NA' : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
const cell = (s, f, withN1) => (s.n ? `${f(s.mean)} · ${f(s.median)} · ${f(s.min)}–${f(s.max)}${withN1 ? ` · ${s.n1}/${s.n}` : ''}` : 'NA');
export const sha256Lf = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');

export function format(res, { command, inputs = [] } = {}) {
  const L = [];
  L.push('# E9-lite — bảng độ phủ tuyệt đối và chi phí bằng tiền [Khám phá, sau khi thấy dữ liệu]', '');
  L.push('Phân tích khám phá, sau khi thấy dữ liệu, không thuộc đăng ký, chỉ mô tả (khối §9 "Phân tích khám phá bổ sung sau phản biện E9-lite"). Không p-value. Dữ liệu: Nội bộ.', '');
  if (command) L.push('- Lệnh: `' + command + '`');
  for (const i of inputs) L.push(`- sha256 (tính trên LF) \`${i.path}\`: \`${i.sha256}\``);
  L.push(`- Nguồn giá: \`${PRICE_SOURCE}\`, PRICING_VERSION = \`${PRICING_VERSION}\`; cache ghi 1 giờ (mặc định của \`costOf\`). Giá niêm yết theo phiên bản này, không phải hóa đơn thực.`);
  L.push(`- Bootstrap theo bài: B = ${res.B}, seed ${res.seed}, percentile 2,5/97,5 (khoảng 95 %), như §9 (6).`);
  L.push(`- Khóa: ${res.nKeys}; lượt tính (done cuối): ${res.nKept}; khóa không có done: ${res.nNoDone}; số bài: ${res.nTasks}. Mỗi bài = trung bình các lần lặp done được chọn.`);
  L.push('- Chi phí tính trên `usage.tokens` của cả phiên planOnly (route + plan), không gồm phần thực thi; token pha `plan` = `usage.byPhase.plan`.', '');

  L.push('## 1. Bảng giá trị tuyệt đối theo arm', '', 'Mỗi ô: trung bình theo bài · trung vị · min–max · (hai cột độ phủ) số bài đạt 1,0.', '',
    '| Đại lượng | S (Sonnet) | O (Opus) | H (Haiku) |', '|---|---|---|---|');
  const rowsDef = [['Độ phủ tệp (raw.covFile)', 'covFile', f3, true], ['Độ phủ module (raw.covMod)', 'covMod', f3, true], ['Số hạng mục (raw.items)', 'items', (x) => fx(x, 2), false], ['Token có trọng số pha plan', 'planTok', int, false]];
  for (const [label, k, f, n1] of rowsDef) L.push(`| ${label} | ${ARM_ORDER.map((a) => cell(res.abs[a][k], f, n1)).join(' | ')} |`);
  L.push('');
  const sat = (m) => ARM_ORDER.map((a) => `${ARM_SHORT[a]} ${res.abs[a][m].n1}/${res.abs[a][m].n}`).join(', ');
  L.push(`**Độ phủ có bão hòa (ở trần) không?** Số bài đạt 1,0 — module: ${sat('covMod')}; tệp: ${sat('covFile')}. ` +
    `Module: ${res.saturated.covMod ? 'có, cả ba arm đạt 1,0 ở mọi bài' : 'chưa bão hòa hoàn toàn (không phải cả ba arm đạt 1,0 ở mọi bài)'}. ` +
    `Tệp: ${res.saturated.covFile ? 'có, cả ba arm đạt 1,0 ở mọi bài' : 'chưa bão hòa hoàn toàn'}.`, '');
  L.push('Số bài có hiệu độ phủ bằng 0 (hiệu theo bài, mỗi bài là trung bình các lần lặp):', '', '| Cặp | Thước | n bài | hiệu > 0 | hiệu = 0 | hiệu < 0 |', '|---|---|---|---|---|---|');
  for (const [name, d] of Object.entries(res.covDiff)) for (const m of ['covMod', 'covFile']) L.push(`| ${name} | ${m} | ${d[m].n} | ${d[m].pos} | ${d[m].zero} | ${d[m].neg} |`);
  L.push('');

  L.push('## 2. Chi phí bằng USD theo arm', '', 'Giá theo model của từng dòng. Haiku báo hai bậc: cận dưới (`costUsdLow`, bậc ≤ 100K prompt) và cận trên (`costUsd`, bậc > 100K). Sonnet/Opus không có bậc nên hai cận bằng nhau. Mỗi ô: trung bình theo bài · trung vị · min–max (USD).', '',
    '| Đại lượng | S (Sonnet) | O (Opus) | H (Haiku) |', '|---|---|---|---|');
  L.push(`| USD/bài, cận dưới | ${ARM_ORDER.map((a) => cell(res.abs[a].costLow, usd)).join(' | ')} |`);
  L.push(`| USD/bài, cận trên | ${ARM_ORDER.map((a) => cell(res.abs[a].costHigh, usd)).join(' | ')} |`, '');
  L.push('Hiệu theo bài (USD), khoảng bootstrap 95 %. Chỉ ghi "rẻ hơn"/"đắt hơn" khi khoảng tách 0 ở cả hai bậc giá.', '',
    '| Cặp | Bậc giá | n | Hiệu TB | KTC 95 % | > 0 / = 0 / < 0 | Kết luận |', '|---|---|---|---|---|---|---|');
  for (const [name, d] of Object.entries(res.costDiff)) {
    for (const [tier, label] of [['low', 'cận dưới'], ['high', 'cận trên']]) {
      const s = d[tier]; const ci = s.boot ? `[${usd(s.boot.lo)}; ${usd(s.boot.hi)}]` : 'chưa đủ bài';
      L.push(`| ${name} | ${label} | ${s.n} | ${usd(s.boot ? s.boot.mean : null)} | ${ci} | ${s.pos} / ${s.zero} / ${s.neg} | ${sepFromZero(s.boot)} |`);
    }
    L.push(`| ${name} | **cả hai bậc** | | | | | **${d.verdict}** |`);
  }
  L.push('');

  const F = res.failed;
  L.push('## 3. Dòng không phải `done` (failed), báo riêng, không vào phép so', '');
  L.push(`Tổng: ${F.total.n} dòng; dòng thiếu \`usage\`: ${F.total.noUsage}; tổng token có trọng số (\`weighted()\` trên \`usage.tokens\`): ${int(F.total.weighted)}; USD: cận dưới ${usd(F.total.low)}, cận trên ${usd(F.total.high)}.`, '',
    '| Arm | Số dòng | Dòng thiếu usage | Token có trọng số | USD cận dưới | USD cận trên |', '|---|---|---|---|---|---|');
  for (const a of ARM_ORDER) { const s = F.byArm[a]; if (s) L.push(`| ${ARM_SHORT[a]} | ${s.n} | ${s.noUsage} | ${int(s.weighted)} | ${usd(s.low)} | ${usd(s.high)} |`); }
  L.push('');
  return L.join('\n') + '\n';
}

function main(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const runsPath = opt('--runs'); const goldPath = opt('--gold'); const labelsPath = opt('--labels'); const outPath = opt('--out');
  if (!runsPath || !goldPath || !labelsPath) { console.error('Dùng: e9lite-cost.mjs --runs <runs.jsonl> --gold <gold.json> --labels <labels.json> [--out <report-cost.md>] [--tasks-dir <dir>]'); return 2; }
  if (!existsSync(runsPath)) { console.error(`Chưa có ${runsPath}`); return 2; }
  const runsText = readFileSync(runsPath, 'utf8'); const goldText = readFileSync(goldPath, 'utf8'); const labelsText = readFileSync(labelsPath, 'utf8');
  const { rows } = parseRuns(runsText);
  const gold = JSON.parse(goldText);
  const tasksDir = resolve(opt('--tasks-dir', 'bench/vs-claude/tasks')); const repoDirs = {};
  for (const t of gold.tasks) { const p = join(tasksDir, t.id, 'task.json'); if (existsSync(p)) repoDirs[t.id] = JSON.parse(readFileSync(p, 'utf8')).repoDir ?? 'starter'; }
  const res = analyzeCost({ rows, gold, repoDirs });
  const command = `node docs/research/analysis/e9lite-cost.mjs --runs ${runsPath} --gold ${goldPath} --labels ${labelsPath} --out <tệp đầu ra>`;
  const inputs = [[runsPath], [goldPath], [labelsPath]].map(([p]) => ({ path: p, sha256: sha256Lf(readFileSync(p, 'utf8')) }));
  const text = format(res, { command, inputs });
  if (outPath) writeFileSync(outPath, text); else process.stdout.write(text);
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
// ARMS được re-export để test kiểm thứ tự arm khớp e9lite.mjs.
export { ARMS };
