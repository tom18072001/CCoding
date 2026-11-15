#!/usr/bin/env node
// S4 (BRIEF-19 K1/K3): đánh giá lại nhãn "lỗi thật" của mọi đột biến t5-logq bằng bộ test ẩn đầy đủ, trên máy hiện tại. Không gọi LLM.
// Dựng lại đúng vị trí đột biến như g-repro.mjs (cùng danh sách vị trí, cùng sample theo hạt `${seed}|${key}`), chạy test ẩn `--reps` lần.
// Ghi mỗi đột biến: nhãn cũ (G), số lần trượt / số lần chạy, tên test trượt, tổng test đếm được.
//   node docs/research/analysis/v43f-t5-relabel.mjs --out docs/research/analysis/v43f-e8-t5logq/t5-relabel.jsonl [--reps 3] [--jobs 6] [--task t5-logq]
import fs from 'node:fs'; import path from 'node:path';
import { mutationSites, applySite, rng, sample, productFiles, overlayStarter } from './g-mutation.mjs';
import { hiddenOnce, ROOT, TASKS } from './t5logq-probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('out'); const reps = Number(arg('reps', 3)); const jobs = Number(arg('jobs', 6)); const taskId = arg('task', 't5-logq');
const G = path.join(ROOT, 'bench', 'vs-claude', 'results', 'g-mutation', 'g-mutation.jsonl');
const ART = path.join(ROOT, 'bench', 'vs-claude', 'results', 'study-cloud', 'artifacts');
const rows = fs.readFileSync(G, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const meta = rows.find((r) => r.type === 'meta');
const mut = rows.filter((r) => r.type === 'mut' && r.task === taskId);
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.key}|${r.i}`; }) : []);
fs.mkdirSync(path.dirname(out), { recursive: true });
const names = (o) => [...o.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()).filter((n) => !n.startsWith('hidden/'));

async function one(m) {
  const task = JSON.parse(fs.readFileSync(path.join(TASKS, taskId, 'task.json'), 'utf8'));
  // vị trí đột biến: tính trên bản sao có starter chồng lên, như g-repro.mjs
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'relabel-'));
  let site;
  try {
    fs.cpSync(path.join(ART, m.key), tmp, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });
    overlayStarter(tmp, path.join(TASKS, taskId, task.repoDir ?? 'repo'));
    const sites = [];
    for (const f of productFiles(tmp, task.deliverable)) { const t = fs.readFileSync(path.join(tmp, f), 'utf8'); try { for (const s of mutationSites(t, f)) sites.push({ ...s, file: f }); } catch { /* bỏ */ } }
    site = sample(sites, meta.perRun, rng(`${meta.seed}|${m.key}`))[m.i];
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!site || site.file !== m.file || site.line !== m.line || site.op !== m.op || site.repl !== m.repl) return { key: m.key, i: m.i, mismatchSite: true };
  const res = [];
  for (let r = 0; r < reps; r++) {
    const h = await hiddenOnce(path.join(ART, m.key), (dir) => { const fp = path.join(dir, site.file); fs.writeFileSync(fp, applySite(fs.readFileSync(fp, 'utf8'), site)); }, taskId);
    res.push({ pass: h.pass, total: h.total, failed: names(h.out) });
  }
  return { key: m.key, task: m.task, arm: m.arm, i: m.i, op: m.op, line: m.line, real0: m.real, vRed0: m.vRed, failRuns: res.filter((x) => !x.pass).length, reps, totals: res.map((x) => x.total), failedTests: [...new Set(res.flatMap((x) => x.failed))] };
}
const queue = mut.filter((m) => !done.has(`${m.key}|${m.i}`));
let n = 0;
const worker = async () => { for (;;) { const m = queue.shift(); if (!m) return; fs.appendFileSync(out, JSON.stringify(await one(m)) + '\n'); if (++n % 20 === 0) console.error(`${n} xong`); } };
await Promise.all(Array.from({ length: jobs }, worker));
const res = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ok = res.filter((r) => !r.mismatchSite);
console.log(`đột biến ${taskId}: ${mut.length}; dựng lại đúng vị trí: ${ok.length}; nhãn thật cũ ${ok.filter((r) => r.real0).length}; trượt ≥ 1/${reps} lần nay: ${ok.filter((r) => r.failRuns > 0).length}; khớp nhãn: ${ok.filter((r) => r.real0 === (r.failRuns > 0)).length}`);
