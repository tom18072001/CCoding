#!/usr/bin/env node
// V4-3f-G, kiểm độ lặp lại (sai lệch G-b): đánh giá lại N đột biến chọn theo hạt giống, so (lỗi thật, bị chặn) với lần đầu.
//   node docs/research/analysis/g-repro.mjs <g-mutation.jsonl> <artifacts> <tasks> <out.jsonl> [--n 200] [--seed 20261104|repro]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mutationSites, applySite, rng, sample, productFiles, visible, hidden, overlayStarter } from './g-mutation.mjs';

const [file, artifacts, tasksDir, out] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const N = Number(arg('n', 200)), seedRepro = arg('seed', '20261104|repro');
const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const meta = rows.find((r) => r.type === 'meta');
const mut = rows.filter((r) => r.type === 'mut');
const pick = sample(mut, N, rng(seedRepro));
fs.writeFileSync(out, '');
const copy = (src, dst) => fs.cpSync(src, dst, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });
async function one(m) {
  const task = JSON.parse(fs.readFileSync(path.join(tasksDir, m.task, 'task.json'), 'utf8'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'g-rep-'));
  try {
    copy(path.join(artifacts, m.key), work);
    overlayStarter(work, path.join(tasksDir, m.task, task.repoDir ?? 'repo'));
    const sites = [];
    for (const f of productFiles(work, task.deliverable)) { const t = fs.readFileSync(path.join(work, f), 'utf8'); try { for (const s of mutationSites(t, f)) sites.push({ ...s, file: f }); } catch { /* bỏ */ } }
    const s = sample(sites, meta.perRun, rng(`${meta.seed}|${m.key}`))[m.i];
    if (!s || s.file !== m.file || s.line !== m.line || s.op !== m.op || s.repl !== m.repl) return { key: m.key, i: m.i, mismatchSite: true };
    const fp = path.join(work, s.file);
    fs.writeFileSync(fp, applySite(fs.readFileSync(fp, 'utf8'), s));
    const v = await visible(work), h = await hidden(work, path.join(tasksDir, m.task, 'hidden'));
    return { key: m.key, i: m.i, real0: m.real, vRed0: m.vRed, real1: !h.pass, vRed1: v.red };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const queue = pick.slice();
const worker = async () => { for (;;) { const m = queue.shift(); if (!m) return; fs.appendFileSync(out, JSON.stringify(await one(m)) + '\n'); } };
await Promise.all([worker(), worker()]);
const res = fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const ok = res.filter((r) => !r.mismatchSite);
const same = ok.filter((r) => r.real0 === r.real1 && r.vRed0 === r.vRed1).length;
console.log(`đánh giá lại ${res.length} đột biến (hạt giống ${seedRepro}); dựng lại đúng vị trí: ${ok.length}; khớp cả hai nhãn: ${same}/${ok.length}; lệch lỗi thật: ${ok.filter((r) => r.real0 !== r.real1).length}; lệch bị chặn: ${ok.filter((r) => r.vRed0 !== r.vRed1).length}`);
