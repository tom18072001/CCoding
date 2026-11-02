#!/usr/bin/env node
// Analyse a results folder: node analyze.mjs results/<run> [--baseline A0-sonnet] [--treatment B0]
// Writes report.md, summary.csv and pareto.csv into the folder.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const argv = process.argv.slice(3);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const allRows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const infraRows = allRows.filter((r) => r.status === 'infra'); // hạn mức / lỗi hạ tầng, không phải kết quả của arm
const rows = allRows.filter((r) => r.status !== 'infra');
if (infraRows.length) console.log(`Đã loại ${infraRows.length} dòng infra (hạn mức/lỗi hạ tầng) khỏi phân tích.`);
const leaks = rows.filter((r) => r.leak);
const R = rows.filter((r) => !r.leak);
const arms = [...new Set(R.map((r) => r.arm))];
const tasks = [...new Set(R.map((r) => r.task))].sort();
const BASE = flag('baseline', arms.includes('A0-sonnet') ? 'A0-sonnet' : arms[0]);
const TREAT = flag('treatment', arms.includes('B0') ? 'B0' : arms[1] ?? arms[0]);

// ---------- small stats kit (no deps) ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
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
  const ratio = (metric) => tasks.map((t) => median(cell(TREAT, t, metric)) / median(cell(BASE, t, metric))).filter(Number.isFinite);
  const tr = ratio('weighted'), wr = ratio('wallSec');
  const share = tr.filter((x, i) => x >= 3 && (wr[i] ?? 0) >= 1.5).length / Math.max(1, tr.length);
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
  for (let i = 0; i < P; i++) { const ys = pts.map((x) => x[1]).sort(() => rnd() - 0.5); if (Math.abs(slope(pts.map((x, j) => [x[0], ys[j]]))) >= Math.abs(b)) ext++; }
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
