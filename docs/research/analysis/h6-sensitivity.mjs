#!/usr/bin/env node
// §9 "Phân tích độ nhạy mô tả cho H6: bài có sàn null cao" (đặt trước dữ liệu E6). Chỉ mô tả, không p mới.
//   node docs/research/analysis/h6-sensitivity.mjs [bench/vs-claude/results/h6-3e/runs.jsonl]
// (i) Δ = TB theo bài của (điểm A − điểm B0), CI 90 % bootstrap hai tầng (B = 4000, hạt 20261102), trên 5 bài (bỏ t2-orders, t4-perf);
// (ii) Δ_i từng bài kèm dải 1 − null (null từ context/d11-suite-review-2026-11-04.md §4);
// (iii) cờ "nhạy với bài" nếu Δ̂ đổi phía so với 0 hoặc CI đổi vị trí so với ±0,05 khi so với 7 bài.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapDiff } from './e5f-analyze.mjs';
import { mean } from './prereg-tests.mjs';

const H6_TASKS = ['l1-modules', 'l2-chain', 't1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const NULL_FLOOR = { 'l1-modules': 0.0, 'l2-chain': 0.01, 't1-duration': 0.0, 't2-orders': 0.53, 't3-api': 0.13, 't4-perf': 0.84, 't5-logq': 0.01 };
const MARGIN = 0.05;

export function sensitivity(rows) {
  const ok = rows.filter((r) => r.status === 'done' && !r.excluded && !r.leak);
  const cell = (arm, t) => ok.filter((r) => r.arm === arm && r.task === t).map((r) => r.score);
  const out = {};
  for (const arm of ['A1', 'A2']) {
    const ds = (tasks) => {
      const use = tasks.filter((t) => cell(arm, t).length && cell('B0', t).length);
      return { tasks: use, ...bootstrapDiff(use.map((t) => cell('B0', t)), use.map((t) => cell(arm, t)), { seed: 20261102, level: 0.9 }) };
    };
    const all7 = ds(H6_TASKS), five = ds(H6_TASKS.filter((t) => t !== 't2-orders' && t !== 't4-perf'));
    const side = (x) => (x.est > 1e-12 ? 1 : x.est < -1e-12 ? -1 : 0);
    const inside = (x) => x.lo >= -MARGIN && x.hi <= MARGIN;
    out[arm] = {
      all7, five,
      perTask: H6_TASKS.map((t) => ({ task: t, nA: cell(arm, t).length, nB0: cell('B0', t).length, meanA: mean(cell(arm, t)), meanB0: mean(cell('B0', t)), delta: mean(cell(arm, t)) - mean(cell('B0', t)), range: 1 - NULL_FLOOR[t] })),
      sensitive: side(all7) !== side(five) || inside(all7) !== inside(five),
    };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2] ?? 'bench/vs-claude/results/h6-3e/runs.jsonl';
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const s = sensitivity(rows);
  const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
  const pp = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1).replace('.', ',')} pp` : '—');
  for (const [arm, r] of Object.entries(s)) {
    console.log(`\n## ${arm} so với B0 (Δ = điểm ${arm} − điểm B0)\n`);
    console.log(`- 7 bài: Δ = ${pp(r.all7.est)}, CI 90 % [${pp(r.all7.lo)}; ${pp(r.all7.hi)}]`);
    console.log(`- 5 bài (bỏ t2-orders, t4-perf): Δ = ${pp(r.five.est)}, CI 90 % [${pp(r.five.lo)}; ${pp(r.five.hi)}]`);
    console.log(`- Nhạy với bài: ${r.sensitive ? 'có' : 'không'}\n`);
    console.log('| Bài | n A | n B0 | TB A | TB B0 | Δ_i | dải 1 − null |\n|---|---|---|---|---|---|---|');
    for (const t of r.perTask) console.log(`| ${t.task} | ${t.nA} | ${t.nB0} | ${f(t.meanA)} | ${f(t.meanB0)} | ${pp(t.delta)} | ${f(t.range, 2)} |`);
  }
}
