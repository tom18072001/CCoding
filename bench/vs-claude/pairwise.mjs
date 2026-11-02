#!/usr/bin/env node
// Blinded pairwise preference for open-ended deliverables (design, requirements, research review).
//   node pairwise.mjs results/<run> --x A0-sonnet --y B0 [--model opus] [--categories design,requirements,research]
// Each (task, repeat) pair is judged twice with the order swapped; disagreement counts as a tie. Writes pairwise.jsonl + pairwise.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgePair } from './lib/judge.mjs';

const SUITE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const argv = process.argv.slice(3);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const X = flag('x', 'A0-sonnet'), Y = flag('y', 'B0'), model = flag('model', 'opus');
const cats = flag('categories', 'design,requirements,research').split(',');
const rows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => cats.includes(r.category) && !r.leak);
const outFile = path.join(dir, 'pairwise.jsonl');
const seen = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const deliverable = (key, task) => {
  const base = path.join(dir, 'artifacts', key);
  const files = [task.deliverable, 'REVIEW.md', 'NOTES.md'].map((f) => path.join(base, f)).filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return files.length ? files.map((p) => `## ${path.basename(p)}\n${fs.readFileSync(p, 'utf8')}`).join('\n\n') : fs.readFileSync(path.join(base, '_FINAL.txt'), 'utf8');
};
const rubric = {
  design: 'Correct capacity arithmetic; feasible architecture; integrity and masking mechanisms; conflicts in the inputs identified with alternatives.',
  requirements: 'Every ambiguity and contradiction surfaced with a sensible interim assumption; implementable, testable requirements.',
  research: 'Every claim grounded in the corpus with correct citations; no fabrication; comparability caveats noted; clear synthesis.',
};
for (const rx of rows.filter((r) => r.arm === X)) {
  const ry = rows.find((r) => r.arm === Y && r.task === rx.task && r.rep === rx.rep);
  const id = `${rx.task}#${rx.rep}`;
  if (!ry || seen.has(id)) continue;
  const task = JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', rx.task, 'task.json'), 'utf8'));
  process.stdout.write(`${id} ... `);
  const v = await judgePair(task.brief, rubric[task.category], deliverable(rx.key, task), deliverable(ry.key, task), { model });
  fs.appendFileSync(outFile, `${JSON.stringify({ id, task: rx.task, x: X, y: Y, ...v })}\n`);
  console.log(v.winner === 'x' ? X : v.winner === 'y' ? Y : 'tie');
}
const all = fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.x === X && r.y === Y);
const n = all.length, wx = all.filter((r) => r.winner === 'x').length, wy = all.filter((r) => r.winner === 'y').length;
const md = `# Pairwise (blinded, both orders)\n\n${X} wins ${wx}, ${Y} wins ${wy}, ties ${n - wx - wy} of ${n} pairs. ${Y} win rate excluding ties: ${wx + wy ? ((wy / (wx + wy)) * 100).toFixed(0) : 'n/a'}%.\n`;
fs.writeFileSync(path.join(dir, 'pairwise.md'), md);
console.log(md);
