// Test analyze.mjs theo suite-review §5 (S6: SR-01c, 03, 04, 05iii, 06, 07, 12, 20, 25, 26) trên runs.jsonl tổng hợp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANALYZE = path.resolve(HERE, '../analyze.mjs');

/** Ghi rows vào thư mục tạm, chạy analyze.mjs; trả { code, out, err, report }. */
function run(rows, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-sr-'));
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const p = spawnSync(process.execPath, [ANALYZE, dir, ...args], { encoding: 'utf8' });
  const rp = path.join(dir, 'report.md');
  return { code: p.status, out: p.stdout, err: p.stderr, report: fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '', dir };
}

let n = 0;
const row = (task, arm, score, extra = {}) => ({
  key: `${task}__${arm}__r${++n}`, task, category: extra.category ?? 'coding', size: extra.size ?? 3, arm, rep: n, status: 'done',
  wallSec: extra.wallSec ?? 10, tokens: { weighted: extra.weighted ?? 1000 }, costUsd: 0, leak: false, score, pass: score >= 0.99, formatMiss: false,
  details: extra.details, ...extra.fields,
});
const hRow = (report, id) => report.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';

const base = () => ['c3', 'c4', 'c5'].flatMap((t) => [row(t, 'A0-sonnet', 0.5), row(t, 'A0-sonnet', 0.6), row(t, 'B0', 0.7), row(t, 'B0', 0.8)]);

test('SR-01c: lượt excluded bị loại và đếm theo arm; dòng cũ thiếu trường giữ nguyên', () => {
  const rows = base();
  rows.push(row('c3', 'B0', 0.0, { fields: { excluded: 'quota' } }), row('c3', 'A0-sonnet', 0.0, { fields: { excluded: 'timeout' } }), row('c4', 'B0', 0.0, { fields: { excluded: 'leak' } }));
  const a = run(rows);
  assert.equal(a.code, 0, a.err);
  assert.match(a.report, /3 lượt excluded/);
  assert.match(a.report, /A0-sonnet: timeout 1/);
  assert.match(a.report, /B0: (quota 1, leak 1|leak 1, quota 1)/);
  const b = run(base());
  assert.match(b.report, /0 lượt excluded/);
  assert.equal(hRow(a.report, 'H1'), hRow(b.report, 'H1'));
});

test('SR-03: hai hash CCoding trong một arm ⇒ cảnh báo; --strict ⇒ từ chối', () => {
  const rows = base();
  rows.filter((r) => r.arm === 'B0').forEach((r, i) => { r.ccodingCommit = i % 2 ? 'aaa1111' : 'bbb2222'; });
  const w = run(rows);
  assert.equal(w.code, 0);
  assert.match(w.report, /CẢNH BÁO SR-03.*B0: (aaa1111, bbb2222|bbb2222, aaa1111)/);
  const s = run(rows, ['--strict']);
  assert.notEqual(s.code, 0);
  assert.match(s.err, /SR-03/);
  const ok = base();
  ok.forEach((r) => { r.ccodingCommit = 'aaa1111'; });
  assert.doesNotMatch(run(ok, ['--strict']).report, /CẢNH BÁO SR-03/);
});

test('SR-07: judge khác nhau cùng bài ⇒ từ chối; ghi model giám khảo vào báo cáo', () => {
  const rows = base();
  rows[0].details = { judge: 'opus' }; rows[1].details = { judge: 'sonnet' };
  const bad = run(rows);
  assert.notEqual(bad.code, 0);
  assert.match(bad.err, /SR-07/);
  const good = base();
  good.forEach((r) => { r.details = { judge: 'opus' }; });
  const g = run(good);
  assert.equal(g.code, 0, g.err);
  assert.match(g.report, /Giám khảo: opus/);
  const mix = base(); mix[0].details = { judge: 'opus' };
  assert.notEqual(run(mix).code, 0);
  const allowed = run(mix, ['--allow-mixed-judge']);
  assert.equal(allowed.code, 0);
  assert.match(allowed.report, /CẢNH BÁO SR-07/);
});

test('SR-20: báo cáo ghi hạt; mặc định mulberry32 tái lập; --legacy-rng đổi sang LCG', () => {
  const a = run(base()), b = run(base()), l = run(base(), ['--legacy-rng']);
  assert.match(a.report, /RNG: mulberry32, hạt 20261102/);
  assert.match(l.report, /RNG: LCG cũ \(--legacy-rng\), hạt 12345/);
  assert.equal(hRow(a.report, 'H1'), hRow(b.report, 'H1'));
  assert.equal(hRow(a.report, 'H10'), hRow(b.report, 'H10'));
  assert.notEqual(hRow(a.report, 'H1'), hRow(l.report, 'H1'));
});

test('SR-26 ca 9 / SR-20: --legacy-rng trên study-cloud cho H1, H2, H10 trùng mốc d11-baseline', () => {
  const root = path.resolve(HERE, '../../..');
  const baseline = fs.readFileSync(path.join(root, 'docs/research/context/d11-baseline/study-cloud/report.md'), 'utf8');
  const rows = fs.readFileSync(path.join(root, 'bench/vs-claude/results/study-cloud/runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const r = run(rows, ['--legacy-rng', '--allow-mixed-judge']);
  assert.equal(r.code, 0, r.err);
  for (const id of ['H1', 'H10']) assert.equal(hRow(r.report, id), hRow(baseline, id), id);
  // H2: ước lượng, CI 95 % và p của `compare` không đổi; chỉ phán quyết đổi (SR-04: TOST thay `est <= 0.05`)
  const part = (rep) => /\| (\+2\.8 pp \[[^\]]*\], p=[0-9.]+, tasks=\d+)/.exec(hRow(rep, 'H2'))?.[1];
  assert.ok(part(baseline));
  assert.equal(part(r.report), part(baseline));
});

test('SR-05(iii): H10 xáo Fisher-Yates tái lập theo hạt và cho p trong (0, 0.5) với 6 điểm', () => {
  const rows = [];
  for (const [i, t] of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].entries()) {
    const b = 0.5 + 0.05 * i + (i % 2) * 0.1;
    rows.push(row(t, 'A0-sonnet', 0.5, { size: i + 1 }), row(t, 'A0-sonnet', 0.5, { size: i + 1 }), row(t, 'B0', b, { size: i + 1 }), row(t, 'B0', b, { size: i + 1 }));
  }
  const fy = run(rows), fy2 = run(rows), lg = run(rows, ['--legacy-rng']);
  assert.equal(hRow(fy.report, 'H10'), hRow(fy2.report, 'H10'));
  const p = +/permutation p=([0-9.]+)/.exec(hRow(fy.report, 'H10'))[1];
  assert.ok(p > 0 && p < 0.5, `p=${p}`);
  assert.match(hRow(lg.report, 'H10'), /permutation p=/);
});

test('SR-06: H5 ghép tr và wr theo bài, bài có tỉ số vô hạn bị bỏ cả hai chỉ số', () => {
  const mk = (t, bw, tw, bs, ts) => [row(t, 'A0-sonnet', 0.5, { weighted: bw, wallSec: bs }), row(t, 'B0', 0.5, { weighted: tw, wallSec: ts })];
  // a: token cơ sở 0 ⇒ tỉ số vô hạn (bỏ); b, c: token ×4, thời gian ×2 ⇒ đạt cả hai ngưỡng
  const rows = [...mk('a', 0, 1000, 10, 10), ...mk('b', 1000, 4000, 10, 20), ...mk('c', 1000, 4000, 10, 20)];
  const r = run(rows);
  assert.match(hRow(r.report, 'H5'), /tasks meeting both thresholds 100%/);
});

// ---------- SR-04 / SR-12 / SR-26 ----------
const mkCells = (task, arm, scores, extra = {}) => scores.map((s) => row(task, arm, s, extra));
const T7 = ['l1-modules', 'l2-chain', 't1-duration', 't2-orders', 't3-api'];
const h6Data = (b0, a1, a2, tasks = T7, extra2 = {}) => tasks.flatMap((t) => [...mkCells(t, 'B0', b0), ...mkCells(t, 'A1', a1), ...mkCells(t, 'A2', a2, extra2), ...mkCells(t, 'A0-sonnet', b0)]);

test('SR-04 H2: ước lượng ≤ 5 pp nhưng CI 90 % tràn biên ⇒ không phán SUPPORTED; CI gọn trong biên ⇒ SUPPORTED', () => {
  const noisy = ['l3', 'l4', 'l5'].flatMap((t) => [...mkCells(t, 'A0-sonnet', [0.2, 0.9, 0.3], { category: 'logic' }), ...mkCells(t, 'B0', [0.3, 0.9, 0.3], { category: 'logic' })]);
  assert.match(hRow(run(noisy).report, 'H2'), /not supported/);
  const tight = ['l3', 'l4', 'l5'].flatMap((t) => [...mkCells(t, 'A0-sonnet', [0.70, 0.71, 0.69], { category: 'logic' }), ...mkCells(t, 'B0', [0.71, 0.70, 0.70], { category: 'logic' })]);
  const r = hRow(run(tight).report, 'H2');
  assert.match(r, /TOST90/);
  assert.match(r, /SUPPORTED/);
  assert.doesNotMatch(r, /not supported/);
});

test('SR-26 H3: hoán vị chính xác trên s1 r = 10, p = 1/184756, xác nhận qua Holm', () => {
  const d = { category: 'review' };
  const rows = ['A0-sonnet', 'B0'].flatMap((a) => Array.from({ length: 10 }, () => row('s1-sec-review', a, 0.5, { ...d, details: { recall: a === 'B0' ? 1 : 0.5, precision: 1 } })));
  const r = hRow(run(rows).report, 'H3');
  assert.match(r, /N=184756/);
  assert.match(r, /recall p=5\.41e-6/);
  assert.match(r, /confirmable=có/);
  assert.match(r, /SUPPORTED/);
  assert.doesNotMatch(r, /not supported/);
});

test('SR-26 H3: r = 3 ⇒ p_min = 1/20 > ngưỡng ⇒ không xác nhận được dù tách hoàn toàn', () => {
  const d = { category: 'review' };
  const rows = ['A0-sonnet', 'B0'].flatMap((a) => Array.from({ length: 3 }, () => row('s1-sec-review', a, 0.5, { ...d, details: { recall: a === 'B0' ? 1 : 0.2, precision: 1 } })));
  const r = hRow(run(rows).report, 'H3');
  assert.match(r, /confirmable=không/);
  assert.match(r, /not supported \(p_min > ngưỡng/);
});

test('SR-26 H3: dịch biên recall −0,15 và precision +0,05 (recall hơn 0,10 < biên ⇒ p = 1; precision kém 0,10 > biên ⇒ p lớn)', () => {
  const mk = (rb, pb) => ['A0-sonnet', 'B0'].flatMap((a) => Array.from({ length: 10 }, () => row('s1-sec-review', a, 0.5, { category: 'review', details: { recall: a === 'B0' ? rb : 0.5, precision: a === 'B0' ? pb : 0.9 } })));
  const r = hRow(run(mk(0.6, 0.9)).report, 'H3');
  assert.match(r, /recall p=1\.0000/);
  assert.match(r, /not supported/);
  // precision kém đi 0,10: b + 0,05 vẫn thấp hơn a ⇒ precision p = 1
  assert.match(hRow(run(mk(1, 0.8)).report, 'H3'), /precision p=1\.0000/);
});

test('SR-26 H3: precision NaN (null) bị bỏ và báo số lượt bỏ', () => {
  const d = { category: 'review' };
  const rows = ['A0-sonnet', 'B0'].flatMap((a) => Array.from({ length: 10 }, (_, i) => row('s1-sec-review', a, 0.5, { ...d, details: { recall: a === 'B0' ? 1 : 0.5, precision: i < 2 ? null : 1 } })));
  assert.match(hRow(run(rows).report, 'H3'), /bỏ 4 lượt precision NaN/);
});

test('SR-26 H6 (c): Δ* suy biến ⇒ p = NA, không bao giờ in 1/(B+1); phán quyết theo CI ("Bác bỏ")', () => {
  const r = hRow(run(h6Data([0.7, 0.7, 0.7], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])).report, 'H6');
  assert.match(r, /bootstrap Bác bỏ/);
  assert.match(r, /p=NA/);
  assert.doesNotMatch(r, /2\.50e-4|0\.0002|0\.0003/);
  assert.match(r, /not supported/);
});

test('SR-26 H6 (b)(d): mọi bài chạm trần ở cả hai arm ⇒ loại hết, < 3 bài ⇒ ước lượng, ngoài họ Holm', () => {
  const r = hRow(run(h6Data([1, 1, 1], [1, 1, 1], [1, 1, 1])).report, 'H6');
  assert.match(r, /n=0/);
  assert.match(r, /insufficient data/);
  assert.match(r, /ngoài họ Holm/);
  assert.match(hRow(run(h6Data([1, 1, 1], [1, 1, 1], [1, 1, 1])).report, 'Holm {H3, H6}'), /K=0|họ rỗng/);
});

test('SR-12 + SR-26 H6: cả A1 và A2 trong biên ⇒ SUPPORTED, báo n, tỉ số token A2/B0; một arm lệch ⇒ không SUPPORTED', () => {
  const ok = hRow(run(h6Data([0.70, 0.72, 0.68, 0.70], [0.71, 0.69, 0.70, 0.70], [0.70, 0.71, 0.69, 0.70], T7, { weighted: 2000 })).report, 'H6');
  assert.match(ok, /A1: n=5/);
  assert.match(ok, /A2: n=5/);
  assert.match(ok, /A2\/B0 x2\.00/);
  assert.match(ok, /SUPPORTED/);
  assert.doesNotMatch(ok, /not supported/);
  const one = hRow(run(h6Data([0.70, 0.72, 0.68, 0.70], [0.71, 0.69, 0.70, 0.70], [0.90, 0.91, 0.89, 0.90])).report, 'H6');
  assert.match(one, /not supported/);
});

test('SR-26 họ Holm: H6 NA xếp như 1, không chặn H3', () => {
  const d = { category: 'review' };
  const s1 = ['A0-sonnet', 'B0'].flatMap((a) => Array.from({ length: 10 }, () => row('s1-sec-review', a, 0.5, { ...d, details: { recall: a === 'B0' ? 1 : 0.5, precision: 1 } })));
  const rows = [...s1, ...h6Data([0.7, 0.7, 0.7], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])];
  const h = hRow(run(rows).report, 'Holm {H3, H6}');
  assert.match(h, /K=2/);
  assert.match(h, /H3: .*⇒ xác nhận/);
  assert.doesNotMatch(h, /H6: [^;]*⇒ xác nhận/);
});

test('SR-25: H1′ hoán vị phân tầng, p_min = 1/∏C(2r,r), nhãn dự kiến chưa khóa; margin 0,05 + alt less cho H2′', () => {
  // 6 bài × r = 2 mỗi arm: ∏ C(4,2) = 6^6 = 46656 ⇒ p_min = 1/46656 = 2.14e-5, B0 hơn hẳn ⇒ p = p_min
  const names = ['l1-modules', 't1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
  const rows = names.flatMap((t) => [...mkCells(t, 'A0-sonnet', [0.2, 0.3]), ...mkCells(t, 'B0', [0.8, 0.9])]);
  const h1 = hRow(run(rows).report, 'H1′');
  assert.match(h1, /bài=6/);
  assert.match(h1, /liệt kê đủ \(46656\)/);
  assert.match(h1, /p=2\.14e-5, p_min=2\.14e-5/);
  assert.match(h1, /confirmable=có/);
  assert.match(h1, /dự kiến, chưa khóa/);
  // r = 1, 6 bài: ∏ = 64 ⇒ p_min = 0,0156 > 0,0125 ⇒ không confirmable
  const r1 = names.flatMap((t) => [row(t, 'A0-sonnet', 0.2), row(t, 'B0', 0.9)]);
  assert.match(hRow(run(r1).report, 'H1′'), /p_min=0\.0156.*confirmable=không/);
  // H2′: B0 kém hơn A0 ⇒ T < 0 ⇒ alt less cho p nhỏ; B0 hơn 0,2 ⇒ p lớn
  const chain = (b) => ['A0-sonnet', 'B0'].flatMap((a) => mkCells('l2-chain', a, a === 'B0' ? [b, b, b, b] : [0.6, 0.6, 0.6, 0.6]));
  const worse = hRow(run(chain(0.4)).report, 'H2′'), better = hRow(run(chain(0.8)).report, 'H2′');
  assert.match(worse, /p=0\.0143/);
  assert.match(better, /p=1\.0000/);
});

test('D6: bài set exploratory không vào H1–H10 và H1′/H2′, chỉ ở bảng khám phá', () => {
  const rows = [...base(), ...['A0-sonnet', 'B0'].flatMap((a) => mkCells('a2-ambiguity-new', a, a === 'B0' ? [1, 1] : [0, 0]))];
  // task.json của bài thật chưa có a2; tạo bài tạm ngay trong thư mục tasks, dọn sau khi chạy
  const dir = path.resolve(HERE, '../tasks/a2-ambiguity-new');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify({ id: 'a2-ambiguity-new', set: 'exploratory' }));
    const withX = run(rows), without = run(base());
    assert.equal(hRow(withX.report, 'H1'), hRow(without.report, 'H1'));
    assert.match(withX.report, /Exploratory tasks/);
    assert.match(withX.report, /a2-ambiguity-new/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SR-04 B-01: TOST log-tỉ số ba đại lượng; thiếu arm SL ⇒ insufficient data', () => {
  const none = run(base());
  assert.match(hRow(none.report, 'B-01a'), /insufficient data/);
  const same = ['t1-duration', 't2-orders', 't3-api'].flatMap((t) => [...mkCells(t, 'A0-sonnet', [0.8, 0.81, 0.79]), ...mkCells(t, 'SL', [0.8, 0.79, 0.81])]);
  for (const id of ['B-01a', 'B-01b', 'B-01c']) assert.match(hRow(run(same).report, id), /SUPPORTED/, id);
  const slow = ['t1-duration', 't2-orders', 't3-api'].flatMap((t) => [...mkCells(t, 'A0-sonnet', [0.8, 0.8, 0.8]), ...mkCells(t, 'SL', [0.8, 0.8, 0.8], { weighted: 3000 })]);
  assert.match(hRow(run(slow).report, 'B-01a'), /not supported/);
});
