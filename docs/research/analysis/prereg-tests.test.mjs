// Test cho prereg-tests.mjs trên dữ liệu giả có đáp án biết trước. Chạy: node --test docs/research/analysis/prereg-tests.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRatio, tostVerdict, tostScoreWithCeiling, iut, classifyRows, rng, h5Pair, windowOf, MARGIN, SEED } from './prereg-tests.mjs';

const TASKS = ['a', 'b', 'c', 'd', 'e'];
/** Mỗi bài 9 lượt quanh `center`, độ lệch ±`spread` theo mẫu cố định (không ngẫu nhiên). */
const cell = (center, spread = 0) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => center * (1 + (spread * k) / 4));
const cellsOf = (center, spread) => TASKS.map(() => cell(center, spread));

test('tỉ số 1,00 phương sai nhỏ → tương đương (xác nhận)', () => {
  const r = bootstrapRatio(cellsOf(100, 0.02), cellsOf(100, 0.02));
  assert.ok(Math.abs(r.est - 1) < 1e-9);
  assert.ok(r.lo >= MARGIN[0] && r.hi <= MARGIN[1], `CI [${r.lo}, ${r.hi}]`);
  assert.equal(tostVerdict(r), 'xác nhận');
});

test('tỉ số 1,30 → không tương đương (bác bỏ), cận dưới > 1,15', () => {
  const r = bootstrapRatio(cellsOf(100, 0.03), cellsOf(130, 0.03));
  assert.ok(Math.abs(r.est - 1.3) < 1e-9);
  assert.ok(r.lo > MARGIN[1]);
  assert.equal(tostVerdict(r), 'bác bỏ');
});

test('tỉ số 0,70 → bác bỏ ở phía dưới', () => {
  const r = bootstrapRatio(cellsOf(100, 0.03), cellsOf(70, 0.03));
  assert.ok(r.hi < MARGIN[0]);
  assert.equal(tostVerdict(r), 'bác bỏ');
});

test('CI cắt biên → không kết luận (tỉ số 1,10 phương sai lớn)', () => {
  const a = TASKS.map(() => cell(100, 0.5)), b = TASKS.map(() => cell(110, 0.5));
  const r = bootstrapRatio(a, b);
  assert.ok(r.lo < MARGIN[1] && r.hi > MARGIN[1], `CI [${r.lo}, ${r.hi}] phải cắt 1,15`);
  assert.equal(tostVerdict(r), 'không kết luận');
});

test('trần: mọi lượt ≥ 0,99 ở cả hai arm → (c) không kết luận dù CI = [1, 1]', () => {
  const a = TASKS.map(() => [1, 1, 1, 1, 1, 1]), b = TASKS.map(() => [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const raw = bootstrapRatio(a, b);
  assert.equal(raw.degenerate, true);
  assert.ok(Number.isNaN(raw.p), 'p = NA khi suy biến');
  const c = tostScoreWithCeiling(TASKS, a, b);
  assert.deepEqual(c.ceilingTasks, TASKS);
  assert.equal(c.verdict, 'không kết luận');
  assert.match(c.reason, /trần/);
});

test('trần một phần: chỉ còn 2 bài không trần (< 3) → không kết luận; còn 3 bài → tính được', () => {
  const ceil = [1, 1, 1, 0.995, 1, 1], low = [0.7, 0.72, 0.74, 0.71, 0.73, 0.72];
  const two = tostScoreWithCeiling(TASKS, [ceil, ceil, ceil, low, low], [ceil, ceil, ceil, low, low]);
  assert.deepEqual(two.ceilingTasks, ['a', 'b', 'c']);
  assert.equal(two.verdict, 'không kết luận');
  const three = tostScoreWithCeiling(TASKS, [ceil, ceil, low, low, low], [ceil, ceil, low, low, low]);
  assert.deepEqual(three.keptTasks, ['c', 'd', 'e']);
  assert.equal(three.verdict, 'xác nhận');
});

test('trần: một arm có lượt < 0,99 thì giữ bài (chạm trần một phía)', () => {
  const a = TASKS.map(() => [1, 1, 1, 1, 1, 1]), b = TASKS.map(() => [1, 1, 1, 0.98, 1, 1]);
  assert.deepEqual(tostScoreWithCeiling(TASKS, a, b).ceilingTasks, []);
});

test('IUT: một phép trượt thì B-01 trượt', () => {
  assert.equal(iut(['xác nhận', 'xác nhận', 'xác nhận']), 'xác nhận');
  assert.equal(iut(['xác nhận', 'xác nhận', 'không kết luận']), 'không kết luận');
  assert.equal(iut(['xác nhận', 'bác bỏ', 'không kết luận']), 'bác bỏ');
  assert.equal(iut(['không kết luận', 'xác nhận', 'xác nhận']), 'không kết luận');
});

test('cùng hạt cho cùng kết quả; khác hạt cho CI khác', () => {
  const a = TASKS.map((_, i) => cell(100 + i, 0.2)), b = TASKS.map((_, i) => cell(105 + i, 0.2));
  const r1 = bootstrapRatio(a, b, { seed: SEED }), r2 = bootstrapRatio(a, b, { seed: SEED }), r3 = bootstrapRatio(a, b, { seed: SEED + 1 });
  assert.deepEqual(r1, r2);
  assert.notEqual(r1.lo, r3.lo);
  const g1 = rng(SEED), g2 = rng(SEED);
  assert.deepEqual([g1(), g1(), g1()], [g2(), g2(), g2()]);
});

test('TB = 0 (log không xác định) → không kết luận, không giả CI', () => {
  const r = bootstrapRatio(TASKS.map(() => [0, 0, 0]), TASKS.map(() => [0.5, 0.6, 0.7]));
  assert.equal(tostVerdict(r), 'không kết luận');
});

const mk = (o) => ({ key: `${o.task}__${o.arm}__r${o.rep}`, task: 't', arm: 'A0-sonnet', rep: 1, at: '2026-11-02T12:00:00Z', status: 'done', wallSec: 60, tokens: { weighted: 1000 }, score: 1, leak: false, ...o });

test('loại lượt: Q, L, T hạ tầng, E4; giữ T-giữ, N1 và lượt done', () => {
  const rows = [
    mk({ rep: 1 }),
    mk({ rep: 2, leak: true }),
    mk({ rep: 3, status: 'failed', wallSec: 5, tokens: { weighted: 0 }, error: 'HTTP 429 usage_limit' }),
    mk({ rep: 4, status: 'failed', wallSec: 1190, error: 'ECONNRESET' }),
    mk({ rep: 5, status: 'failed', wallSec: 1195, error: '' }),
    mk({ rep: 6, status: 'failed', wallSec: 300, error: 'assert fail', tokens: { weighted: 5000 } }),
    mk({ rep: 7, status: 'error', error: 'ENOENT repo/' }),
    mk({ rep: 8, status: 'infra' }),
    mk({ rep: 1 }),
  ];
  const { kept, excluded, flags } = classifyRows(rows, { timeoutMin: 20 });
  assert.deepEqual(excluded.map((e) => e.code), ['L', 'Q', 'T', 'E4', 'E4', 'E4']);
  assert.equal(kept.length, 3);
  assert.equal(flags.tKeep, 1);
  assert.equal(flags.n1Keep, 1);
});

test('H5: ghép theo bài, đếm bài đạt 3× token và 1,5× thời gian', () => {
  const R = [];
  const add = (arm, task, tok, wall) => { for (let rep = 1; rep <= 3; rep++) R.push(mk({ arm, task, rep, key: `${task}${arm}${rep}`, tokens: { weighted: tok }, wallSec: wall })); };
  add('A0-sonnet', 'x', 100, 10); add('B0', 'x', 400, 20);   // ×4 ; ×2 → đạt
  add('A0-sonnet', 'y', 100, 10); add('B0', 'y', 400, 12);   // ×4 ; ×1,2 → không
  add('A0-sonnet', 'z', 100, 10); add('B0', 'z', 200, 30);   // ×2 ; ×3 → không
  const h = h5Pair(R, 'A0-sonnet', 'B0', ['x', 'y', 'z']);
  assert.equal(h.pass, 1);
  assert.equal(h.nAligned, 3);
  assert.ok(Math.abs(h.tokMed - 4) < 1e-9 && Math.abs(h.wallMed - 2) < 1e-9);
  assert.ok(h.tokCI[0] <= h.tokMed && h.tokMed <= h.tokCI[1]);
});

test('cửa sổ gán theo thời điểm ghi dòng', () => {
  assert.equal(windowOf({ at: '2026-11-02T11:44:04.212Z' }), 'W1');
  assert.equal(windowOf({ at: '2026-11-02T15:00:00Z' }), 'W2a');
  assert.equal(windowOf({ at: '2026-11-02T16:00:00Z' }), 'W2b');
  assert.equal(windowOf({ at: '2026-11-02T16:30:00Z' }), 'W2c');
  assert.equal(windowOf({ at: '2026-11-02T19:12:10Z' }), 'B7a');
});
