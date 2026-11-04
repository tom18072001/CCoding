#!/usr/bin/env node
// Analyse a results folder: node analyze.mjs results/<run> [--baseline A0-sonnet] [--treatment B0]
// Writes report.md, summary.csv and pareto.csv into the folder.
// Cờ: --allow-mixed-judge (chỉ đối chiếu dữ liệu cũ, SR-07) · --strict (từ chối khi một arm có >1 hash CCoding, SR-03) · --legacy-rng (LCG + xáo cũ để tái lập số cũ, SR-20).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, fisherYates } from './lib/stats.mjs';

const dir = path.resolve(process.argv[2] ?? '.');
const argv = process.argv.slice(3);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const allRows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const has = (k) => argv.includes(`--${k}`);
const STRICT = has('strict');
const infraRows = allRows.filter((r) => r.status === 'infra'); // hạn mức / lỗi hạ tầng, không phải kết quả của arm
const afterInfra = allRows.filter((r) => r.status !== 'infra');
if (infraRows.length) console.log(`Đã loại ${infraRows.length} dòng infra (hạn mức/lỗi hạ tầng) khỏi phân tích.`);
// SR-01c: lượt có `excluded` (quota | leak | timeout) bị loại; dòng cũ thiếu trường coi là null, không loại.
const excludedRows = afterInfra.filter((r) => r.excluded);
const rows = afterInfra.filter((r) => !r.excluded);
const excludedByArm = {};
for (const r of excludedRows) { const e = (excludedByArm[r.arm] ??= {}); e[r.excluded] = (e[r.excluded] ?? 0) + 1; }
const excludedTxt = Object.entries(excludedByArm).map(([a, e]) => `${a}: ${Object.entries(e).map(([k, n]) => `${k} ${n}`).join(', ')}`).join('; ') || 'không';
if (excludedRows.length) console.log(`SR-01: đã loại ${excludedRows.length} lượt excluded (${excludedTxt}).`);
const die = (msg) => { console.error(msg); process.exit(1); };
// SR-03: một arm chạy bằng nhiều hash CCoding thì cảnh báo; --strict thì từ chối.
const commitsByArm = {};
for (const r of rows) if (r.ccodingCommit) (commitsByArm[r.arm] ??= new Set()).add(r.ccodingCommit);
const multiCommit = Object.entries(commitsByArm).filter(([, s]) => s.size > 1).map(([a, s]) => `${a}: ${[...s].join(', ')}`);
const commitWarn = multiCommit.length ? `CẢNH BÁO SR-03: arm có nhiều hơn một hash CCoding (${multiCommit.join('; ')}).` : '';
if (commitWarn) { console.warn(commitWarn); if (STRICT) die('Từ chối (--strict, SR-03): một arm có nhiều hơn một hash CCoding.'); }
// SR-07: một chế độ chấm cho mỗi bài. Lượt không ghi `details.judge` chỉ bị tính là "khác" khi bài có lượt đã ghi giám khảo.
const judgesByTask = {};
for (const r of rows) (judgesByTask[r.task] ??= new Set()).add(r.details?.judge ?? null);
const mixedJudge = Object.entries(judgesByTask).filter(([, s]) => s.size > 1 && [...s].some((j) => j !== null)).map(([t, s]) => `${t}: ${[...s].map((j) => j ?? '(không ghi)').join(' / ')}`);
const mixedWarn = mixedJudge.length ? `CẢNH BÁO SR-07: chế độ chấm khác nhau giữa các lượt cùng bài (${mixedJudge.join('; ')}); chạy với --allow-mixed-judge chỉ để đối chiếu dữ liệu cũ, không dùng cho phân tích chính.` : '';
if (mixedJudge.length && !has('allow-mixed-judge')) die(`Từ chối (SR-07): chế độ chấm khác nhau giữa các lượt cùng bài (${mixedJudge.join('; ')}). Chạy lại với một giám khảo (hoặc --allow-mixed-judge để đối chiếu dữ liệu cũ).`);
const judgeModels = [...new Set(rows.map((r) => r.details?.judge).filter(Boolean))];
const judgeTxt = judgeModels.length ? judgeModels.join(', ') : 'không ghi (regex hoặc dữ liệu cũ)';
const leaks = rows.filter((r) => r.leak);
const Rall = rows.filter((r) => !r.leak);
const tasksAll = [...new Set(Rall.map((r) => r.task))].sort();
// D6: bài `set: "exploratory"` không vào H1–H10, tập bài H6 và H1′/H2′; chỉ ở bảng khám phá.
const SUITE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tasks');
const setOf = (t) => { try { return JSON.parse(fs.readFileSync(path.join(SUITE, t, 'task.json'), 'utf8')).set; } catch { return undefined; } };
const exploratory = tasksAll.filter((t) => setOf(t) === 'exploratory');
const tasks = tasksAll.filter((t) => !exploratory.includes(t));
const R = Rall.filter((r) => !exploratory.includes(r.task));
const Rx = Rall.filter((r) => exploratory.includes(r.task));
const arms = [...new Set(Rall.map((r) => r.arm))];
const BASE = flag('baseline', arms.includes('A0-sonnet') ? 'A0-sonnet' : arms[0]);
const TREAT = flag('treatment', arms.includes('B0') ? 'B0' : arms[1] ?? arms[0]);

// ---------- small stats kit (no deps) ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// SR-20: mulberry32 có hạt, ghi vào báo cáo. --legacy-rng giữ LCG cũ (và cách xáo cũ ở H10) để tái lập số đã công bố.
const LEGACY = has('legacy-rng');
const SEED = LEGACY ? 12345 : 20261102;
let lcg = SEED;
const rnd = LEGACY ? () => ((lcg = (lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) : mulberry32(SEED);
const rngTxt = LEGACY ? `LCG cũ (--legacy-rng), hạt ${SEED}, xáo H10 kiểu cũ` : `mulberry32, hạt ${SEED}, xáo H10 Fisher-Yates`;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pp = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pp` : 'n/a');

const get = (r, metric) => {
  if (metric === 'score') return r.score;
  if (metric === 'pass') return r.pass ? 1 : 0;
  if (metric === 'weighted') return r.tokens?.weighted ?? 0;
  if (metric === 'wallSec') return r.wallSec ?? 0;
  if (metric.startsWith('detail:')) return metric.slice(7).split('.').reduce((o, k) => o?.[k], r.details);
  return undefined;
};
const cell = (arm, task, metric = 'score') => R.filter((r) => r.arm === arm && r.task === task).map((r) => get(r, metric)).filter((v) => v !== undefined && v !== null).map(Number);

/** Paired comparison over tasks: delta = mean(b) - mean(a) per task, then averaged. Two-level bootstrap CI + sign-flip permutation p. */
function compare(a, b, { metric = 'score', filter = () => true } = {}) {
  const ts = tasks.filter((t) => filter(t) && cell(a, t, metric).length && cell(b, t, metric).length);
  if (!ts.length) return { n: 0 };
  const deltas = ts.map((t) => mean(cell(b, t, metric)) - mean(cell(a, t, metric)));
  const est = mean(deltas);
  const boots = [];
  for (let i = 0; i < 4000; i++) {
    const d = [];
    for (let j = 0; j < ts.length; j++) { const t = pick(ts); const xa = cell(a, t, metric), xb = cell(b, t, metric); d.push(mean(xb.map(() => pick(xb))) - mean(xa.map(() => pick(xa)))); }
    boots.push(mean(d));
  }
  boots.sort((x, y) => x - y);
  let extreme = 0; const P = 10000;
  for (let i = 0; i < P; i++) { const m = mean(deltas.map((d) => (rnd() < 0.5 ? -d : d))); if (Math.abs(m) >= Math.abs(est) - 1e-12) extreme++; }
  return { n: ts.length, est, lo: boots[Math.floor(0.025 * boots.length)], hi: boots[Math.floor(0.975 * boots.length)], p: extreme / P, deltas: Object.fromEntries(ts.map((t, i) => [t, deltas[i]])) };
}
const catOf = Object.fromEntries(R.map((r) => [r.task, r.category]));
const sizeOf = Object.fromEntries(R.map((r) => [r.task, r.size]));
const inCats = (...c) => (t) => c.includes(catOf[t]);

// ---------- hypotheses ----------
const H = [];
const verdict = (ok, unknown) => (unknown ? 'insufficient data' : ok ? 'SUPPORTED' : 'not supported');
{
  const c = compare(BASE, TREAT, { filter: (t) => ['coding', 'design'].includes(catOf[t]) && sizeOf[t] >= 3 });
  H.push(['H1', `Decomposable work (coding/design, size>=3): ${TREAT} - ${BASE}`, `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], p=${f(c.p, 3)}, tasks=${c.n}`, verdict(c.est >= 0.1 && c.lo > 0, !c.n)]);
}
{
  const c = compare(BASE, TREAT, { filter: inCats('logic') });
  H.push(['H2', `Coupled reasoning (logic) is not better: ${TREAT} - ${BASE}`, `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], p=${f(c.p, 3)}, tasks=${c.n}`, verdict(c.est <= 0.05, !c.n)]);
}
{
  const s = tasks.filter(inCats('review'));
  const m = (arm, k) => mean(s.flatMap((t) => cell(arm, t, `detail:${k}`)));
  const lines = [[BASE, TREAT], ['B2', TREAT]].filter(([a]) => arms.includes(a)).map(([a, b]) => `${b} vs ${a}: recall ${pp(m(b, 'recall') - m(a, 'recall'))}, precision ${pp(m(b, 'precision') - m(a, 'precision'))}`);
  const ok = m(TREAT, 'recall') - m(BASE, 'recall') >= 0.15 && m(BASE, 'precision') - m(TREAT, 'precision') <= 0.05;
  H.push(['H3', 'Review raises seeded-issue recall without hurting precision', lines.join('; ') || 'n/a', verdict(ok, !s.length)]);
}
{
  const c = compare(BASE, TREAT, { filter: inCats('requirements') });
  H.push(['H4', 'Planted-ambiguity detection (requirements)', `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], tasks=${c.n}`, verdict(c.est >= 0.2, !c.n)]);
}
{
  const ratio = (metric) => tasks.map((t) => median(cell(TREAT, t, metric)) / median(cell(BASE, t, metric)));
  // SR-06: ghép tr và wr theo bài, bỏ bài có tỉ số NaN/vô hạn ở bất kỳ chỉ số nào trước khi đếm.
  const rT = ratio('weighted'), rW = ratio('wallSec');
  const pairs = tasks.map((t, i) => [rT[i], rW[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const tr = pairs.map((x) => x[0]), wr = pairs.map((x) => x[1]);
  const share = tr.filter((x, i) => x >= 3 && wr[i] >= 1.5).length / Math.max(1, tr.length);
  H.push(['H5', `Cost ratio ${TREAT}/${BASE}`, `weighted tokens median x${f(median(tr), 1)}, wall time median x${f(median(wr), 1)}; tasks meeting both thresholds ${(share * 100).toFixed(0)}%`, verdict(share >= 0.8, !tr.length)]);
}
{
  const parts = ['A1', 'A2'].filter((a) => arms.includes(a)).map((a) => { const c = compare(a, TREAT); return { a, c }; });
  const txt = parts.map(({ a, c }) => `${TREAT} - ${a}: ${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}]`).join('; ');
  const ok = parts.length && parts.some(({ c }) => Math.abs(c.est) <= 0.05);
  H.push(['H6', 'Compute-matched single agent matches CCoding (null)', txt || 'needs arms A1/A2', verdict(ok, !parts.length)]);
}
{
  const r = tasks.map((t) => { const a = sd(cell(BASE, t)), b = sd(cell(TREAT, t)); return a > 0 ? b / a : (b === 0 ? 1 : NaN); }).filter(Number.isFinite);
  H.push(['H7', 'Run-to-run stability (SD ratio treatment/baseline)', `median SD ratio ${f(median(r))} over ${r.length} tasks`, verdict(median(r) <= 0.7, r.length < 3)]);
}
{
  const fm = (arm) => mean(R.filter((x) => x.arm === arm).map((x) => (x.formatMiss ? 1 : 0)));
  const fail = (arm) => mean(R.filter((x) => x.arm === arm && x.category === 'coding').map((x) => (x.details?.total ? (x.details.total - x.details.passed) / x.details.total : 0)));
  H.push(['H8', 'Coordination failures (deliverable missing / requirements dropped)', `deliverable-missing rate ${BASE} ${pp(fm(BASE))} vs ${TREAT} ${pp(fm(TREAT))}; failed hidden-test share ${BASE} ${pp(fail(BASE))} vs ${TREAT} ${pp(fail(TREAT))}`, verdict(fm(TREAT) > fm(BASE), false) + ' (confirm with transcript review)']);
}
{
  const s = tasks.filter(inCats('research'));
  const m = (arm, k) => mean(s.flatMap((t) => cell(arm, t, `detail:${k}`).map(Number)));
  const dP = m(TREAT, 'citationPrecision') - m(BASE, 'citationPrecision');
  const dR = m(TREAT, 'correctRefusal') - m(BASE, 'correctRefusal');
  H.push(['H9', 'Grounding: citation precision and correct refusal', `citation precision ${pp(dP)}, correct refusal ${pp(dR)}`, verdict(dP >= 0.1 && dR >= 0.1, !s.length)]);
}
{
  const c = compare(BASE, TREAT);
  const pts = Object.entries(c.deltas ?? {}).map(([t, d]) => [sizeOf[t], d]);
  const slope = (p) => { const mx = mean(p.map((x) => x[0])), my = mean(p.map((x) => x[1])); const num = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), den = p.reduce((s, [x]) => s + (x - mx) ** 2, 0); return den ? num / den : NaN; };
  const b = slope(pts); let ext = 0; const P = 5000;
  for (let i = 0; i < P; i++) { const ys = LEGACY ? pts.map((x) => x[1]).sort(() => rnd() - 0.5) : fisherYates(pts.map((x) => x[1]), rnd); if (Math.abs(slope(pts.map((x, j) => [x[0], ys[j]]))) >= Math.abs(b)) ext++; }
  H.push(['H10', 'Advantage grows with task size (slope of delta vs parts)', `slope ${pp(b)} per extra part, permutation p=${f(ext / P, 3)}, tasks=${pts.length}`, verdict(b > 0 && ext / P < 0.05, pts.length < 4)]);
}

// ---------- tables ----------
const summary = [];
for (const a of arms) for (const t of tasks) {
  const rs = R.filter((r) => r.arm === a && r.task === t);
  if (!rs.length) continue;
  summary.push({ arm: a, task: t, category: catOf[t], size: sizeOf[t], n: rs.length, score: mean(rs.map((r) => r.score)), sd: sd(rs.map((r) => r.score)), pass: mean(rs.map((r) => (r.pass ? 1 : 0))), wtok: mean(rs.map((r) => r.tokens?.weighted ?? 0)), usd: mean(rs.map((r) => r.costUsd ?? 0)), wall: median(rs.map((r) => r.wallSec ?? 0)), errors: rs.filter((r) => r.status !== 'done').length });
}
const csv = (objs) => [Object.keys(objs[0] ?? {}).join(','), ...objs.map((o) => Object.values(o).map((v) => (typeof v === 'number' ? +v.toFixed(4) : v)).join(','))].join('\n');
fs.writeFileSync(path.join(dir, 'summary.csv'), csv(summary));
const pareto = arms.map((a) => { const rs = R.filter((r) => r.arm === a); return { arm: a, meanScore: mean(rs.map((r) => r.score)), meanWeightedTokens: mean(rs.map((r) => r.tokens?.weighted ?? 0)), meanUsd: mean(rs.map((r) => r.costUsd ?? 0)), medianWallSec: median(rs.map((r) => r.wallSec ?? 0)), scorePerMillionWtok: mean(rs.map((r) => r.score)) / (mean(rs.map((r) => r.tokens?.weighted ?? 0)) / 1e6 || NaN), runs: rs.length }; });
fs.writeFileSync(path.join(dir, 'pareto.csv'), csv(pareto));

const cats = [...new Set(tasks.map((t) => catOf[t]))];
const byCat = ['| Arm | ' + cats.join(' | ') + ' | Overall | Weighted tok (mean) | Wall s (median) |', '|' + ' --- |'.repeat(cats.length + 4)];
for (const a of arms) {
  const rs = R.filter((r) => r.arm === a);
  byCat.push(`| ${a} | ${cats.map((c) => f(mean(rs.filter((r) => r.category === c).map((r) => r.score)))).join(' | ')} | ${f(mean(rs.map((r) => r.score)))} | ${Math.round(mean(rs.map((r) => r.tokens?.weighted ?? 0))).toLocaleString('en-US')} | ${Math.round(median(rs.map((r) => r.wallSec ?? 0)))} |`);
}
const md = `# CCoding vs single Claude - results

Folder: \`${dir}\` - ${rows.length} runs (${leaks.length} excluded for touching hidden files, ${infraRows.length} infra rows dropped), arms: ${arms.join(', ')}. Baseline **${BASE}**, treatment **${TREAT}**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

Đã loại ${excludedRows.length} lượt excluded (SR-01c; theo arm: ${excludedTxt}). Giám khảo: ${judgeTxt} (SR-07). RNG: ${rngTxt} (SR-20).${commitWarn ? `

${commitWarn}` : ''}${mixedWarn ? `

${mixedWarn}` : ''}

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
${H.map((h) => `| ${h.join(' | ')} |`).join('\n')}

## Mean score by category

${byCat.join('\n')}

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
${pareto.map((p) => `| ${p.arm} | ${f(p.meanScore)} | ${Math.round(p.meanWeightedTokens).toLocaleString('en-US')} | ${f(p.meanUsd)} | ${Math.round(p.medianWallSec)} | ${f(p.scorePerMillionWtok)} |`).join('\n')}

## Per task (${TREAT} - ${BASE})

| Task | Category | Size | ${BASE} | ${TREAT} | Delta |
| --- | --- | --- | --- | --- | --- |
${tasks.map((t) => { const a = mean(cell(BASE, t)), b = mean(cell(TREAT, t)); return `| ${t} | ${catOf[t]} | ${sizeOf[t]} | ${f(a)} | ${f(b)} | ${pp(b - a)} |`; }).join('\n')}

Errors / non-done runs: ${rows.filter((r) => r.status !== 'done').map((r) => r.key).join(', ') || 'none'}.
Leaked runs: ${leaks.map((r) => r.key).join(', ') || 'none'}.
`;
fs.writeFileSync(path.join(dir, 'report.md'), md);
console.log(md);
