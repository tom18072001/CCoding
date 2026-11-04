#!/usr/bin/env node
// Blinded pairwise preference for open-ended deliverables (design, requirements, research review).
//   node pairwise.mjs results/<run> --x A0-sonnet --y B0 [--model opus] [--judge2-model sonnet] [--categories design,requirements,research]
//        [--ballots-out <dir>] [--ballot-frac 0.2] [--seed 20261104]
// Each (task, repeat) pair is judged twice with the order swapped; disagreement counts as a tie. Writes pairwise.jsonl + pairwise.md + pairwise.summary.json.
// SR-08a: --judge2-model chạy giám khảo thứ hai (phải khác --model) trên cùng cặp, ghi judge2/winner2 và judgeAgreement (tỉ lệ + Cohen's kappa).
//         --ballots-out xuất phiếu người chấm (≥ --ballot-frac số cặp): CSV chỉ có mã cặp ẩn danh, tệp A/B đã làm mù; khóa giải mã nằm ở ballots.key.json (KHÔNG đưa cho người chấm).
// SR-08b: kiểm định dấu chính xác + CI Wilson cho tỉ lệ thắng; tiêu đề tệp trung tính, ghi ngôn ngữ từng bên.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agreementRate, ballotCode, ballotsCsv, blind, cohenKappa, detectLang, joinParts, judgePair, pickBallots, signTest, wilson } from './lib/judge.mjs';
import { fisherYates, mulberry32 } from './lib/stats.mjs';

const SUITE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const argv = process.argv.slice(3);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const X = flag('x', 'A0-sonnet'), Y = flag('y', 'B0'), model = flag('model', 'opus'), model2 = flag('judge2-model');
if (model2 && model2 === model) { console.error('--judge2-model phải khác --model (giám khảo thứ hai phải là mô hình khác).'); process.exit(2); }
const bin = flag('judge-bin', 'claude'), binArgs = JSON.parse(flag('judge-bin-args', '[]'));
const ballotsOut = flag('ballots-out'), ballotFrac = Number(flag('ballot-frac', '0.2')), seed = Number(flag('seed', '20261104'));
const cats = flag('categories', 'design,requirements,research').split(',');
const rows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => cats.includes(r.category) && !r.leak);
const outFile = path.join(dir, 'pairwise.jsonl');
const readJsonl = () => (fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const seen = new Set(readJsonl().map((r) => r.id));
const deliverable = (key, task) => {
  const base = path.join(dir, 'artifacts', key);
  const files = [task.deliverable, 'REVIEW.md', 'NOTES.md'].map((f) => path.join(base, f)).filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return files.length ? joinParts(files.map((p) => fs.readFileSync(p, 'utf8'))) : fs.readFileSync(path.join(base, '_FINAL.txt'), 'utf8');
};
const rubric = {
  design: 'Correct capacity arithmetic; feasible architecture; integrity and masking mechanisms; conflicts in the inputs identified with alternatives.',
  requirements: 'Every ambiguity and contradiction surfaced with a sensible interim assumption; implementable, testable requirements.',
  research: 'Every claim grounded in the corpus with correct citations; no fabrication; comparability caveats noted; clear synthesis.',
};
const taskOf = (name) => JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', name, 'task.json'), 'utf8'));
const pairs = rows.filter((r) => r.arm === X).map((rx) => ({ rx, ry: rows.find((r) => r.arm === Y && r.task === rx.task && r.rep === rx.rep), id: `${rx.task}#${rx.rep}` })).filter((p) => p.ry);
const opts = (m) => ({ model: m, bin, binArgs });
for (const { rx, ry, id } of pairs) {
  if (seen.has(id)) continue;
  const task = taskOf(rx.task);
  process.stdout.write(`${id} ... `);
  const dx = deliverable(rx.key, task), dy = deliverable(ry.key, task);
  const v = await judgePair(task.brief, rubric[task.category], dx, dy, opts(model));
  const row = { id, task: rx.task, x: X, y: Y, ...v, judge: model, langX: detectLang(dx), langY: detectLang(dy) };
  row.langMismatch = row.langX !== row.langY;
  if (model2) {
    const v2 = await judgePair(task.brief, rubric[task.category], dx, dy, opts(model2));
    Object.assign(row, { judge2: model2, winner2: v2.winner, votes2: v2.votes, agree: v2.winner === v.winner });
  }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  console.log(v.winner === 'x' ? X : v.winner === 'y' ? Y : 'tie');
}
const all = readJsonl().filter((r) => r.x === X && r.y === Y);
const n = all.length, wx = all.filter((r) => r.winner === 'x').length, wy = all.filter((r) => r.winner === 'y').length;
const st = signTest(wx, wy), ci = wilson(wy, wx + wy);
const dual = all.filter((r) => r.winner2 !== undefined);
const judgeAgreement = dual.length ? agreementRate(dual.map((r) => r.winner), dual.map((r) => r.winner2)) : undefined;
const kappa = dual.length ? cohenKappa(dual.map((r) => r.winner), dual.map((r) => r.winner2)) : undefined;
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : 'n/a');
const summary = { x: X, y: Y, n, winsX: wx, winsY: wy, ties: n - wx - wy, signTestP: st.p, yShare: ci.p, yShareCI95: [ci.lo, ci.hi], judge: model, judge2: model2, judgeAgreement, judgeKappa: kappa, judge2Pairs: dual.length, langMismatchPairs: all.filter((r) => r.langMismatch).length };
const md = `# Pairwise (blinded, both orders)\n\n${X} wins ${wx}, ${Y} wins ${wy}, ties ${n - wx - wy} of ${n} pairs. ${Y} win rate excluding ties: ${pct(ci.p)} (Wilson 95% CI ${pct(ci.lo)}–${pct(ci.hi)}; sign test p = ${st.p.toFixed(4)}, n = ${st.n}).\n\nJudge: ${model}${model2 ? `; second judge: ${model2}, agreement ${pct(judgeAgreement)} over ${dual.length} pairs${kappa === undefined ? '' : ` (kappa ${kappa.toFixed(2)})`}` : '; no second judge (SR-08a: conclusions that depend on pairwise are not locked)'}.\nPairs with a language mismatch (possible unblinding): ${summary.langMismatchPairs}.\n`;
fs.writeFileSync(path.join(dir, 'pairwise.md'), md);
fs.writeFileSync(path.join(dir, 'pairwise.summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(md);

if (ballotsOut) {
  const out = path.resolve(ballotsOut);
  fs.mkdirSync(path.join(out, 'files'), { recursive: true });
  const judged = pairs.filter((p) => all.some((r) => r.id === p.id));
  const salt = crypto.randomBytes(8).toString('hex'), rnd = mulberry32(seed);
  const chosen = pickBallots(judged.length, { frac: ballotFrac, seed }).map((i) => judged[i]);
  const key = {}, csvRows = [];
  for (const p of fisherYates(chosen, rnd)) {
    const task = taskOf(p.rx.task), code = ballotCode(p.id, salt), xFirst = rnd() < 0.5;
    const [a, b] = xFirst ? [p.rx, p.ry] : [p.ry, p.rx];
    for (const [side, r] of [['A', a], ['B', b]]) fs.writeFileSync(path.join(out, 'files', `${code}-${side}.md`), blind(deliverable(r.key, task)));
    csvRows.push({ code, category: task.category, fileA: `files/${code}-A.md`, fileB: `files/${code}-B.md` });
    key[code] = { id: p.id, A: xFirst ? 'x' : 'y', B: xFirst ? 'y' : 'x', judgeWinner: all.find((r) => r.id === p.id)?.winner };
  }
  csvRows.sort((u, v) => u.code.localeCompare(v.code));
  fs.writeFileSync(path.join(out, 'ballots.csv'), ballotsCsv(csvRows));
  fs.writeFileSync(path.join(out, 'ballots.key.json'), `${JSON.stringify({ warning: 'KHÓA GIẢI MÃ — không đưa cho người chấm', x: X, y: Y, salt, frac: ballotFrac, total: judged.length, selected: csvRows.length, key }, null, 2)}\n`);
  console.log(`Phiếu: ${csvRows.length}/${judged.length} cặp (${(100 * csvRows.length / Math.max(1, judged.length)).toFixed(0)}%) → ${path.join(out, 'ballots.csv')}`);
}
