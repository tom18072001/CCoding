// K4 — Cỡ mẫu A/B B-14 bước 2 (runtimes.claude-cli.stablePrefix). Nguồn σ: B7 trong study-cloud/runs.jsonl (done, sau classifyRows).
// Dùng: node docs/research/analysis/k4-b14-step2-n.mjs
// Công cụ: requiredRuns/zInv của bench/vs-claude/harness/stats.mjs (n mỗi nhánh = ⌈2(z_{1−α/2}+z_{1−β})²σ²/Δ²⌉; τ² = 0, bài là khối, r = ⌈n/T⌉).
// Δ là GIẢ ĐỊNH (E1 chỉ chẩn đoán có/không, không ước lượng mức tiết kiệm). Chỉ ĐỌC dữ liệu; không chạy benchmark.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRows, mean } from './prereg-tests.mjs';
import { requiredRuns, zInv } from '../../../bench/vs-claude/harness/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.resolve(HERE, '../../../bench/vs-claude/results/study-cloud/runs.jsonl');
const rows = fs.readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const done = classifyRows(rows).kept.filter((r) => r.status === 'done' && r.arm === 'B7');
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const T15 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const ss = (v) => { const m = mean(v); return v.reduce((s, x) => s + (x - m) ** 2, 0); };

console.log('| Bài | n (B7) | TB token có trọng số | σ_w (ln) | Tỉ lệ 1,25·cacheWrite / có trọng số | Số lần gọi TB |\n|---|--:|--:|--:|--:|--:|');
const per = {};
for (const t of T15) {
  const r = done.filter((x) => x.task === t);
  const v = r.map((x) => Math.log(x.tokens.weighted));
  per[t] = { n: v.length, ss: v.length > 1 ? ss(v) : 0, df: Math.max(0, v.length - 1) };
  const share = mean(r.map((x) => (1.25 * x.tokens.cacheWrite) / x.tokens.weighted));
  console.log(`| ${t} | ${v.length} | ${Math.round(mean(r.map((x) => x.tokens.weighted))).toLocaleString('vi-VN')} | ${f(Math.sqrt(per[t].ss / per[t].df))} | ${f(share)} | ${f(mean(r.map((x) => x.calls)), 1)} |`);
}
const pool = (ts) => Math.sqrt(ts.reduce((s, t) => s + per[t].ss, 0) / ts.reduce((s, t) => s + per[t].df, 0));
const sets = { 'Cả 5 bài t1–t5': T15, 'Ba bài (t1, t2, t3)': ['t1-duration', 't2-orders', 't3-api'], 'Ba bài đề xuất (t2, t3, t4)': ['t2-orders', 't3-api', 't4-perf'] };
const ALPHA = 0.05, POWER = 0.8;
console.log(`\nGiả định: α = ${ALPHA}, power = ${POWER}, hai phía (requiredRuns); Δ = ln(1/(1−x)) trên ln token có trọng số; τ² = 0.\n`);
for (const [name, ts] of Object.entries(sets)) {
  const sigma = pool(ts), T = ts.length;
  console.log(`${name}: σ_w gộp = ${f(sigma)} (df = ${ts.reduce((s, t) => s + per[t].df, 0)})`);
  console.log('| Tiết kiệm giả định x | Δ = ln(1/(1−x)) | n mỗi nhánh (hai phía) | r mỗi bài mỗi nhánh | Tổng lượt (2 nhánh) | n mỗi nhánh (một phía, α = 0,05) |\n|--:|--:|--:|--:|--:|--:|');
  for (const x of [0.05, 0.10, 0.15, 0.20]) {
    const delta = Math.log(1 / (1 - x));
    const n2 = requiredRuns({ sigma, delta, alpha: ALPHA, power: POWER });
    const z1 = zInv(1 - ALPHA) + zInv(POWER), n1 = Math.max(2, Math.ceil((2 * z1 * z1 * sigma * sigma) / (delta * delta)));
    const r = Math.ceil(n2 / T);
    console.log(`| ${f(x * 100, 0)} % | ${f(delta)} | ${n2} | ${r} | ${2 * r * T} | ${n1} |`);
  }
  console.log('');
}
