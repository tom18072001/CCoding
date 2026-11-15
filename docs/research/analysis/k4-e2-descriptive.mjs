// K4 — Phân tích mô tả E2 (gates-pilot): q̂, tỉ lệ bất đồng, chi phí mỗi lượt theo arm; hai bản: gộp, và loại 6 lượt 'lỡ thấy điểm'.
// Dùng: node docs/research/analysis/k4-e2-descriptive.mjs [runs.jsonl]
// Chỉ ĐỌC runs.jsonl; dùng lại jsonlToPairs của gates-pairs.mjs với đúng cờ §9 V4-3e-E2: --unit run, --negatives clean, --label gate.
// Mô tả, không p, không suy diễn recall (§9 V4-3e-E2 mục 1, 6).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonlToPairs, gateKinds, DEFAULT_ARMS } from './gates-pairs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.resolve(process.argv[2] ?? path.join(HERE, '../../../bench/vs-claude/results/gates-pilot/runs.jsonl'));
const text = fs.readFileSync(RUNS, 'utf8');
const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const kinds = gateKinds(JSON.parse(fs.readFileSync(DEFAULT_ARMS, 'utf8')));

// 6 lượt đầu của lệnh 1 = [1/24]…[6/24] (runs.jsonl ghi theo thứ tự hoàn thành, runner chạy tuần tự; `at` tăng dần).
const SEEN = rows.slice(0, 6).map((r) => r.key);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');

// Clopper–Pearson 95 % (chia đôi trên hàm phân phối nhị thức).
function cdf(k, n, p) { let s = 0, c = 1; for (let i = 0; i <= k; i++) { if (i > 0) c = (c * (n - i + 1)) / i; s += c * p ** i * (1 - p) ** (n - i); } return s; }
function cp(k, n, a = 0.05) {
  const solve = (fn) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (fn(m)) lo = m; else hi = m; } return (lo + hi) / 2; };
  const lower = k === 0 ? 0 : solve((p) => 1 - cdf(k - 1, n, p) < a / 2);
  const upper = k === n ? 1 : solve((p) => cdf(k, n, p) > a / 2);
  return [lower, upper];
}

function section(title, exclude) {
  const keep = rows.filter((r) => !exclude.includes(r.key));
  const body = keep.map((r) => JSON.stringify(r)).join('\n');
  const out = [`### ${title} (${keep.length} lượt)`, ''];
  const arms = [...new Set(keep.map((r) => r.arm))].sort();
  const res = jsonlToPairs(body, kinds, { unit: 'run', negatives: 'clean', label: 'gate' });
  out.push('| Arm | Cổng | Số cặp | Số cặp ref = 1 | q̂ = ref=1 / cặp [CP 95 %] | Số bất đồng | Tỉ lệ bất đồng | Số cặp pred = 1 (chặn) |', '|---|---|--:|--:|---|--:|--:|--:|');
  for (const g of ['b02', 'b10', 'cto']) {
    for (const a of arms) {
      const p = res.pairs.filter((x) => x.gate === g && x.arm === a);
      if (!p.length) continue;
      const n = p.length, r1 = p.filter((x) => x.ref === '1').length, dis = p.filter((x) => x.ref !== x.pred).length, bl = p.filter((x) => x.pred === '1').length;
      const qhat = g === 'b10' ? 'n/a (ref theo bài)' : `${f(r1 / n)} [${cp(r1, n).map((x) => f(x)).join('; ')}]`;
      out.push(`| ${a} | ${g} | ${n} | ${r1} | ${qhat} | ${dis} | ${f(dis / n)} | ${bl} |`);
    }
  }
  out.push('', `Bỏ khỏi mẫu cổng (cổng null): ${JSON.stringify(res.skipped)}; bài cài lỗi loại khác: ${JSON.stringify(res.cross)}; không chạy cổng: ${JSON.stringify(res.unrun)}.`, '');
  out.push('| Arm | Số lượt | Token có trọng số / lượt (TB) | Tổng (M) | Test ẩn đạt (`pass`) |', '|---|--:|--:|--:|--:|');
  for (const a of arms) {
    const r = keep.filter((x) => x.arm === a), w = r.map((x) => x.tokens.weighted), s = w.reduce((x, y) => x + y, 0);
    out.push(`| ${a} | ${r.length} | ${Math.round(s / r.length).toLocaleString('vi-VN')} | ${f(s / 1e6, 3)} | ${r.filter((x) => x.pass === true).length}/${r.length} |`);
  }
  return out.join('\n');
}

console.log(`Lượt 'lỡ thấy điểm' (6 lượt đầu của lệnh 1): ${SEEN.join(', ')}\n`);
console.log(section('Bản gộp', []));
console.log('\n' + section("Bản loại 6 lượt 'lỡ thấy điểm'", SEEN));
