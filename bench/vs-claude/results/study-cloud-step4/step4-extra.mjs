#!/usr/bin/env node
// Bước 4 RUNBOOK, phần bổ sung cho prereg-tests.mjs (vòng 3): dùng NGUYÊN các hàm đã khóa của
// docs/research/analysis/prereg-tests.mjs (sha256 3020ca47…), không sửa; chỉ đổi cách chọn ô.
//   node bench/vs-claude/results/study-cloud-step4/step4-extra.mjs [runs.jsonl]
// Mặc định đọc bench/vs-claude/results/study-cloud/runs.jsonl. Không đọc điểm để chọn lượt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const P = await import(path.join(ROOT, 'docs/research/analysis/prereg-tests.mjs'));
const file = process.argv[2] ?? path.join(ROOT, 'bench/vs-claude/results/study-cloud/runs.jsonl');
const DATA = path.dirname(file);
const all = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const finalText = (r) => { try { return fs.readFileSync(path.join(DATA, 'artifacts', r.key, '_FINAL.txt'), 'utf8'); } catch { return ''; } };
const cls = P.classifyRows(all, { timeoutMin: 20, finalText });
const R = cls.kept ?? cls.rows ?? all.filter((r) => r.status !== 'infra' && !r.leak);
const T5 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const val = (r, m) => (m === 'weighted' ? r.tokens?.weighted ?? 0 : m === 'wallSec' ? r.wallSec ?? 0 : r.score);
const cells = (arm, tasks, m, ok = () => true) => tasks.map((t) => R.filter((r) => r.arm === arm && r.task === t && ok(r)).map((r) => val(r, m)));
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const out = [];
const log = (s = '') => out.push(s);
const rep = (lo, hi) => (r) => r.rep >= lo && r.rep <= hi;

function tost(label, armA, okA, armB, okB, tasks = T5) {
  const A = (m) => cells(armA, tasks, m, okA), Bc = (m) => cells(armB, tasks, m, okB);
  const a = P.bootstrapRatio(A('weighted'), Bc('weighted'));
  const b = P.bootstrapRatio(A('wallSec'), Bc('wallSec'));
  const c = P.tostScoreWithCeiling(tasks, A('score'), Bc('score'));
  const va = P.tostVerdict(a), vb = P.tostVerdict(b);
  log(`### ${label}`);
  log('');
  log(`Cỡ ô ${armA}: ${A('score').map((x) => x.length).join('/')}; ${armB}: ${Bc('score').map((x) => x.length).join('/')}.`);
  log('');
  log(`| Phép | R = ${armB}/${armA} | CI 90 % | Kết luận |`);
  log('| --- | ---: | --- | --- |');
  log(`| (a) token có trọng số | ${f(a.est)} | [${f(a.lo, 2)}; ${f(a.hi, 2)}] | ${va} |`);
  log(`| (b) thời gian thực | ${f(b.est)} | [${f(b.lo, 2)}; ${f(b.hi, 2)}] | ${vb} |`);
  log(`| (c) điểm (trần §2.7) | ${f(c.est)} | [${f(c.lo, 2)}; ${f(c.hi, 2)}] | ${c.verdict}${c.reason ? ` (${c.reason})` : ''} |`);
  log('');
  log(`**IUT ba phép: ${P.iut([va, vb, c.verdict])}.**`);
  log('');
}

log('# Bước 4 RUNBOOK: phân tích bổ sung trên 276 lượt (sinh bởi `step4-extra.mjs`; không sửa tay)');
log('');
log(`Dòng đọc: ${all.length}; giữ sau quy tắc loại của \`prereg-tests.mjs\` (\`classifyRows\`): ${R.length}. Hạt ${P.SEED}, B = ${P.B}, biên [${P.MARGIN.join('; ')}].`);
log('');
log('## 1. B-01 cho làn nhanh B6 (FL) trên t1–t5 (`run-plan.md` §4: "B-01 TOST (FL, 45 lượt/arm)")');
log('');
log('B6 r1–3 chạy ở W2b, r4–9 ở B6b; A0-sonnet r1–3 ở W2b, r4–9 ở B7a. Cùng server nhánh `7fb18ba`, khác cửa sổ trong một arm. Bản cùng cửa sổ chỉ có W2b (r1–3).');
log('');
tost('Chính: A0-sonnet r1–9 so với B6 r1–9 (45/45 lượt)', 'A0-sonnet', rep(1, 9), 'B6', rep(1, 9));
tost('Độ nhạy: chỉ cùng cửa sổ W2b (r1–3 cả hai arm)', 'A0-sonnet', rep(1, 3), 'B6', rep(1, 3));
tost('Độ nhạy: A0-sonnet r1–11 (có 2 lượt neo) so với B6 r1–9', 'A0-sonnet', rep(1, 11), 'B6', rep(1, 9));
log('## 2. B-01 (B7) với 2 lượt neo A0-sonnet r10–11');
log('');
tost('Độ nhạy: A0-sonnet r1–11 so với B7 r1–9', 'A0-sonnet', rep(1, 11), 'B7', rep(1, 9));
log('## 3. B7 trên 13 bài ngoài t1–t5 (B7b), mô tả');
log('');
log('**Khác cửa sổ và khác server:** B7 chạy ở B7b (nhánh `7fb18ba`), A0-sonnet r1–3 ở W1/W2a (runner trước/sau `7fb18ba`), B0 ở W1/W2a (`main` `e0bd2f4`). Tỉ số dưới đây chỉ là mô tả, không phải phép xác nhận.');
log('');
const T13 = [...new Set(R.filter((r) => r.arm === 'B7' && !T5.includes(r.task)).map((r) => r.task))].sort();
for (const [lab, A, Bm] of [['B7/A0-sonnet', 'A0-sonnet', 'B7'], ['B7/B0', 'B0', 'B7']]) {
  const ok13 = rep(1, 3);
  const ts = T13.filter((t) => cells(A, [t], 'weighted', ok13)[0].length);
  const a = P.bootstrapRatio(cells(A, ts, 'weighted', ok13), cells(Bm, ts, 'weighted', ok13));
  const b = P.bootstrapRatio(cells(A, ts, 'wallSec', ok13), cells(Bm, ts, 'wallSec', ok13));
  log(`- ${lab} (${ts.length} bài, r1–3): token ×${f(a.est)} [${f(a.lo, 2)}; ${f(a.hi, 2)}], thời gian ×${f(b.est)} [${f(b.lo, 2)}; ${f(b.hi, 2)}] (CI 90 %)`);
}
log('');
log('Theo bài (TB token có trọng số ; TB thời gian, r1–3), B7 so A0-sonnet:');
log('');
log('| Bài | A0-sonnet token | B7 token | × | A0-sonnet s | B7 s | × |');
log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const t of T13) {
  const m = (arm, k) => P.mean(cells(arm, [t], k, rep(1, 3))[0]);
  log(`| ${t} | ${Math.round(m('A0-sonnet', 'weighted'))} | ${Math.round(m('B7', 'weighted'))} | ${f(m('B7', 'weighted') / m('A0-sonnet', 'weighted'), 2)} | ${Math.round(m('A0-sonnet', 'wallSec'))} | ${Math.round(m('B7', 'wallSec'))} | ${f(m('B7', 'wallSec') / m('A0-sonnet', 'wallSec'), 2)} |`);
}
log('');
log('## 4. Điểm mô tả trên 13 bài (TB theo arm, r1–3; không phán)');
log('');
log('| Bài | A0-sonnet | B0 | B7 |');
log('| --- | ---: | ---: | ---: |');
for (const t of T13) log(`| ${t} | ${['A0-sonnet', 'B0', 'B7'].map((a) => f(P.mean(cells(a, [t], 'score', rep(1, 3))[0]), 3)).join(' | ')} |`);
log('');
log('Lưu ý: a1, r1 ở W2a có `--judge` (A0-sonnet, B0), B7b không có `--judge`: điểm hai bài này không so được (SR-07, V3-08).');
console.log(out.join('\n'));
