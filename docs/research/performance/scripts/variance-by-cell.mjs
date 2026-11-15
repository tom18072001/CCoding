#!/usr/bin/env node
// Phương sai / độ lệch chuẩn theo bài × hệ cho thời gian, chi phí, tỉ lệ test ẩn (R3-1, đầu vào cho preregistration).
//   node docs/research/performance/scripts/variance-by-cell.mjs [C7,C8]     # mặc định C7,C8
// Chỉ đọc bench/vs-claude/results/runs.csv, in Markdown ra stdout. Bỏ lượt status != done.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const csv = fs.readFileSync(path.resolve(HERE, '../../../../bench/vs-claude/results/runs.csv'), 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
const h = csv[0].split(',');
// run_note có thể chứa dấu phẩy trong ngoặc kép: tách có xét ngoặc kép
const split = (l) => { const o = []; let f = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === ',' && !q) { o.push(f); f = ''; } else f += c; } o.push(f); return o; };
const rows = csv.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [h[i], v])));
const rounds = (process.argv[2] || 'C7,C8').split(',');
const sel = rows.filter((r) => rounds.includes(r.run) && r.status === 'done');
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => (a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : NaN);
const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
const cells = [...new Set(sel.map((r) => `${r.task}|${r.system}|${r.run}`))].sort();
const out = ['| Bài | Hệ | Vòng | n | Thời gian TB (s) | sd | Chi phí TB (USD) | sd | Test ẩn đạt TB (%) | sd (điểm %) | Σ test ẩn lỗi / Σ test ẩn |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for (const k of cells) {
  const [t, s, R] = k.split('|');
  const rs = sel.filter((r) => r.task === t && r.system === s && r.run === R);
  const w = rs.map((r) => +r.wall_s), c = rs.map((r) => +r.cost_usd), p = rs.map((r) => (100 * +r.hidden_pass) / +r.hidden_total);
  const tot = rs.reduce((a, r) => a + +r.hidden_total, 0), fail = rs.reduce((a, r) => a + (+r.hidden_total - +r.hidden_pass), 0);
  out.push(`| ${t} | ${s} | ${R} | ${rs.length} | ${f(mean(w), 1)} | ${f(sd(w), 1)} | ${f(mean(c), 3)} | ${f(sd(c), 3)} | ${f(mean(p), 2)} | ${f(sd(p), 2)} | ${fail} / ${tot} |`);
}
console.log(out.join('\n'));
