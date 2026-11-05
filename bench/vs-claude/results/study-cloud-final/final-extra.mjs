#!/usr/bin/env node
// Bảng cuối W1–W5: tỉ số chi phí mọi arm so với A0-sonnet trên R13 (r1–3) và điểm mô tả, dùng hàm đã khóa của prereg-tests.mjs.
//   node bench/vs-claude/results/study-cloud-final/final-extra.mjs [runs.jsonl]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const P = await import(path.join(ROOT, 'docs/research/analysis/prereg-tests.mjs'));
const file = process.argv[2] ?? path.join(ROOT, 'bench/vs-claude/results/study-cloud/runs.jsonl');
const R = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.status !== 'infra' && !r.leak);
const R13 = ['a1-ambiguous-spec', 'c1-iis-ecs', 'c2-burst-alert', 'c3-shop-bugs', 'c4-audit-chain', 'c5-tickets-api', 'l1-oncall', 'l2-knights', 'l3-reconcile', 'l4-startup-order', 'r1-elk-design', 're1-lit-synthesis', 's1-sec-review'];
const val = (r, m) => (m === 'weighted' ? r.tokens?.weighted ?? 0 : m === 'wallSec' ? r.wallSec ?? 0 : r.score);
const cells = (arm, tasks, m) => tasks.map((t) => R.filter((r) => r.arm === arm && r.task === t && r.rep <= 3).map((r) => val(r, m)));
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const o = [];
o.push('# Bảng cuối W1–W5 (sinh bởi `final-extra.mjs`; không sửa tay)', '');
o.push(`Dòng giữ (bỏ \`infra\`, leak): ${R.length}. R13, lượt r1–3. Tỉ số = mũ của TB theo bài log(TB arm / TB A0-sonnet); CI 90 % bootstrap hai tầng, hạt ${P.SEED}, B = ${P.B} (\`bootstrapRatio\` của \`prereg-tests.mjs\`). **Mô tả, khác cửa sổ** (A0-sonnet: W1/W2a; B5, B6: W3; A1: W4–W5; A2: W5; B7: B7b). B0/A0-sonnet cùng cửa sổ.`, '');
o.push('| Arm | Server | Bài | Token ×A0 (CI 90 %) | Thời gian ×A0 (CI 90 %) | Điểm TB (13 bài) | A0-sonnet điểm TB |', '| --- | --- | ---: | --- | --- | ---: | ---: |');
const srv = { B0: 'main e0bd2f4', B5: 'main e0bd2f4', B6: 'nhánh 7fb18ba', B7: 'nhánh 7fb18ba', A1: '—', A2: '—' };
for (const arm of ['B0', 'B5', 'B6', 'B7', 'A1', 'A2']) {
  const ts = R13.filter((t) => cells(arm, [t], 'weighted')[0].length && cells('A0-sonnet', [t], 'weighted')[0].length);
  const a = P.bootstrapRatio(cells('A0-sonnet', ts, 'weighted'), cells(arm, ts, 'weighted'));
  const b = P.bootstrapRatio(cells('A0-sonnet', ts, 'wallSec'), cells(arm, ts, 'wallSec'));
  const sc = P.mean(cells(arm, ts, 'score').map(P.mean)), s0 = P.mean(cells('A0-sonnet', ts, 'score').map(P.mean));
  o.push(`| ${arm} | ${srv[arm]} | ${ts.length} | ×${f(a.est)} [${f(a.lo)}; ${f(a.hi)}] | ×${f(b.est)} [${f(b.lo)}; ${f(b.hi)}] | ${f(sc, 3)} | ${f(s0, 3)} |`);
}
o.push('', '## Bài có điểm dưới trần (TB < 0,99 ở ít nhất một arm, r1–3)', '', '| Bài | ' + ['A0-sonnet', 'B0', 'B5', 'B6', 'B7', 'A1', 'A2'].join(' | ') + ' |', '| --- |' + ' ---: |'.repeat(7));
for (const t of R13) {
  const ms = ['A0-sonnet', 'B0', 'B5', 'B6', 'B7', 'A1', 'A2'].map((a) => P.mean(cells(a, [t], 'score')[0]));
  if (ms.some((m) => m < 0.99)) o.push(`| ${t} | ${ms.map((m) => f(m, 3)).join(' | ')} |`);
}
o.push('', '## H4 (a1, `--judge`, r1–11): mô tả', '');
for (const arm of ['A0-sonnet', 'B0']) { const xs = R.filter((r) => r.arm === arm && r.task === 'a1-ambiguous-spec').map((r) => r.score); o.push(`- ${arm}: n = ${xs.length}, TB ${f(P.mean(xs), 3)}, sd ${f(P.sd(xs), 3)}, nhỏ nhất ${f(Math.min(...xs), 3)}`); }
console.log(o.join('\n'));
