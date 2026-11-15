#!/usr/bin/env node
// V4-3f-G, G-5 (khám phá, thêm sau kết quả chính theo phản biện độc lập): đối chứng "chỉ test của starter".
// Với mỗi đột biến đã có ở g-mutation.jsonl: dựng lại sản phẩm, BỎ toàn bộ thư mục test/ của lượt (test agent viết hoặc sửa),
// chép test/ gốc của starter, áp đột biến, chạy `npm test`. So với cổng đầy đủ để biết test do agent viết thêm được bao nhiêu.
//   node docs/research/analysis/g-starter.mjs <g-mutation.jsonl> <artifacts> <tasks> <out.jsonl> [--jobs 2]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mutationSites, applySite, rng, sample, productFiles, visible, overlayStarter } from './g-mutation.mjs';

const [file, artifacts, tasksDir, out] = process.argv.slice(2);
const jobs = Number(process.argv.includes('--jobs') ? process.argv[process.argv.indexOf('--jobs') + 1] : 2);
const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const meta = rows.find((r) => r.type === 'meta');
const byKey = new Map();
for (const r of rows) if (r.type === 'mut') { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); }
const copy = (src, dst) => fs.cpSync(src, dst, { recursive: true, filter: (s) => !s.split(path.sep).some((x) => x === '.git' || x === 'node_modules' || x === '_FINAL.txt') });

/** Bản sao sản phẩm của lượt với test/ thay bằng test/ của starter. */
export function starterOnlyCopy(artifactDir, starterDir) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'g-st-'));
  copy(artifactDir, work);
  overlayStarter(work, starterDir);
  fs.rmSync(path.join(work, 'test'), { recursive: true, force: true });
  if (fs.existsSync(path.join(starterDir, 'test'))) fs.cpSync(path.join(starterDir, 'test'), path.join(work, 'test'), { recursive: true });
  // package.json của starter: lệnh test gốc (agent có thể đã đổi script test)
  if (fs.existsSync(path.join(starterDir, 'package.json'))) fs.copyFileSync(path.join(starterDir, 'package.json'), path.join(work, 'package.json'));
  return work;
}

async function oneRun(key, muts) {
  const task = JSON.parse(fs.readFileSync(path.join(tasksDir, muts[0].task, 'task.json'), 'utf8'));
  const starterDir = path.join(tasksDir, muts[0].task, task.repoDir ?? 'repo');
  const work = starterOnlyCopy(path.join(artifacts, key), starterDir);
  const res = [];
  try {
    const base = await visible(work);
    res.push({ type: 'sbase', key, task: muts[0].task, arm: muts[0].arm, vRed: base.red, vTimeout: !!base.timedOut });
    if (base.red) return res; // test của starter đỏ trên sản phẩm chưa đột biến (vd. agent đổi API): loại khỏi G-5
    // dựng lại vị trí đột biến trên mã sản phẩm (test không ảnh hưởng thứ tự vị trí: productFiles bỏ tệp test)
    const sites = [];
    for (const f of productFiles(work, task.deliverable)) { const t = fs.readFileSync(path.join(work, f), 'utf8'); try { for (const s of mutationSites(t, f)) sites.push({ ...s, file: f }); } catch { /* bỏ */ } }
    const pick = sample(sites, meta.perRun, rng(`${meta.seed}|${key}`));
    for (const m of muts) {
      const s = pick[m.i];
      if (!s || s.file !== m.file || s.line !== m.line || s.op !== m.op || s.repl !== m.repl) { res.push({ type: 'smut', key, i: m.i, mismatchSite: true }); continue; }
      const fp = path.join(work, s.file); const orig = fs.readFileSync(fp, 'utf8');
      fs.writeFileSync(fp, applySite(orig, s));
      let v; try { v = await visible(work); } finally { fs.writeFileSync(fp, orig); }
      res.push({ type: 'smut', key, task: m.task, arm: m.arm, i: m.i, op: m.op, real: m.real, vRedFull: m.vRed, vRedStarter: v.red, vTimeout: !!v.timedOut });
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  return res;
}

fs.writeFileSync(out, JSON.stringify({ type: 'meta', source: file, startedAt: new Date().toISOString(), jobs }) + '\n');
const queue = [...byKey.entries()];
const worker = async () => { for (;;) { const j = queue.shift(); if (!j) return; const r = await oneRun(j[0], j[1]); fs.appendFileSync(out, r.map((x) => JSON.stringify(x)).join('\n') + '\n'); } };
await Promise.all(Array.from({ length: jobs }, worker));
const all = fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const sb = all.filter((r) => r.type === 'sbase'), sm = all.filter((r) => r.type === 'smut' && !r.mismatchSite && r.real);
const g = (f) => { const x = sm.filter(f); return `${x.filter((r) => r.vRedStarter).length}/${x.length} chỉ starter; ${x.filter((r) => r.vRedFull).length}/${x.length} cổng đầy đủ`; };
console.log(`lượt: ${sb.length}, starter đỏ trên base (loại): ${sb.filter((r) => r.vRed).length}; lệch vị trí: ${all.filter((r) => r.mismatchSite).length}`);
console.log(`tất cả: ${g(() => true)}`);
console.log(`A0-sonnet: ${g((r) => r.arm === 'A0-sonnet')}`);
console.log(`CCoding (B0,B5,B6,B7): ${g((r) => ['B0', 'B5', 'B6', 'B7'].includes(r.arm))}`);
