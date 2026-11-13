#!/usr/bin/env node
// E7, điều kiện đọc 2 của Phòng Nghiên cứu (BRIEF-19 K3): số lần test ẩn trượt trên 3 lần chạy (0/3 … 3/3) của từng mục
// trong danh sách chốt. Không gọi LLM, không đọc kết luận của arm. Dựng sản phẩm đúng như prepareItem (artifact, tìm vị trí
// đột biến theo artifact rồi overlay, chép tệp starter thiếu, áp đột biến) nhưng chạy đủ `--trials` lần, không dừng ở lần trượt đầu.
//   node bench/vs-claude/e7/label-trials.mjs --out bench/vs-claude/results/e7-cto [--trials 3] [--kinds faulty,clean] [--artifacts <dir>]
// Ghi <out>/label-trials.jsonl (một dòng mỗi mục, chạy lại được: mục đã có thì bỏ qua) và in bảng đếm theo bài.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySite, overlayStarter } from '../../../docs/research/analysis/g-mutation.mjs';
import { taskDirs } from '../lib/workspace.mjs';
import { copyTree, hiddenPass, locateSite } from './lib.mjs';

/** Dựng thư mục sản phẩm của một mục như prepareItem (không chạy `npm test`). Trả { dir, siteMode } hoặc { reason }. */
export function buildProduct(item, { suite, artifacts }) {
  const task = JSON.parse(fs.readFileSync(path.join(suite, 'tasks', item.task, 'task.json'), 'utf8'));
  const { repoDir: starterDir, hiddenDir } = taskDirs(suite, task);
  const artifactDir = path.join(artifacts, item.key);
  if (!fs.existsSync(artifactDir)) return { reason: 'missing-artifact' };
  let siteMode = null;
  if (item.kind === 'faulty') {
    for (const mode of ['artifact', 'overlay']) {
      const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'e7-lt-probe-'));
      try {
        copyTree(artifactDir, probe);
        if (mode === 'overlay') overlayStarter(probe, starterDir);
        const s = locateSite(probe, task.deliverable, item.key, item.site);
        if (s) { siteMode = { mode, site: s }; break; }
      } finally { fs.rmSync(probe, { recursive: true, force: true }); }
    }
    if (!siteMode) return { reason: 'site-not-found' };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7-lt-'));
  copyTree(artifactDir, dir);
  overlayStarter(dir, starterDir);
  if (siteMode) {
    const fp = path.join(dir, siteMode.site.file);
    const before = fs.readFileSync(fp, 'utf8'), after = applySite(before, siteMode.site);
    if (after === before) { fs.rmSync(dir, { recursive: true, force: true }); return { reason: 'site-not-found' }; }
    fs.writeFileSync(fp, after);
  }
  return { dir, hiddenDir, siteMode: siteMode?.mode ?? null };
}

/** Đếm theo bài × loại: phân bố số lần trượt. rows: dòng label-trials.jsonl. */
export function summarize(rows, trials = 3) {
  const t = {};
  for (const r of rows) {
    if (r.fails == null) continue;
    const c = (t[`${r.task}|${r.kind}`] ??= { task: r.task, kind: r.kind, n: 0, dist: Array(trials + 1).fill(0) });
    c.n++; c.dist[r.fails]++;
  }
  return Object.values(t).sort((a, b) => a.task.localeCompare(b.task) || a.kind.localeCompare(b.kind));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const argv = process.argv.slice(2);
  const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
  const out = path.resolve(flag('out', path.join(SUITE, 'results', 'e7-cto')));
  const trials = Number(flag('trials', '3'));
  const kinds = new Set(flag('kinds', 'faulty,clean').split(','));
  const artifacts = path.resolve(flag('artifacts', path.join(SUITE, 'results', 'study-cloud', 'artifacts')));
  const doc = JSON.parse(fs.readFileSync(path.join(out, 'items.json'), 'utf8'));
  const byId = new Map([...doc.items, ...Object.values(doc.reserve).flatMap((r) => [...r.faulty, ...r.clean])].map((x) => [x.id, x]));
  const sel = JSON.parse(fs.readFileSync(path.join(out, 'selected.json'), 'utf8')).items.map((id) => byId.get(id)).filter((x) => kinds.has(x.kind));
  const file = path.join(out, 'label-trials.jsonl');
  const have = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  let k = 0;
  for (const item of sel) {
    if (have.has(item.id)) continue;
    const b = buildProduct(item, { suite: SUITE, artifacts });
    let row;
    if (!b.dir) row = { id: item.id, task: item.task, kind: item.kind, fails: null, reason: b.reason };
    else {
      try {
        const res = [];
        for (let i = 0; i < trials; i++) { const h = hiddenPass(b.dir, b.hiddenDir); res.push(h.pass ? 1 : 0); }
        row = { id: item.id, task: item.task, kind: item.kind, siteMode: b.siteMode, trials, fails: res.filter((x) => !x).length, passes: res };
      } finally { fs.rmSync(b.dir, { recursive: true, force: true }); }
    }
    fs.appendFileSync(file, `${JSON.stringify({ ...row, at: new Date().toISOString(), platform: process.platform, node: process.version })}\n`);
    process.stdout.write(`[${++k}] ${item.id} ${item.kind} ${row.fails ?? row.reason}/${trials}\n`);
  }
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('\n| Bài | Loại | n | ' + Array.from({ length: trials + 1 }, (_, i) => `trượt ${i}/${trials}`).join(' | ') + ' |');
  console.log('|---|---|--:|' + '--:|'.repeat(trials + 1));
  for (const c of summarize(rows, trials)) console.log(`| ${c.task} | ${c.kind === 'faulty' ? 'lỗi' : 'đúng'} | ${c.n} | ${c.dist.join(' | ')} |`);
}
