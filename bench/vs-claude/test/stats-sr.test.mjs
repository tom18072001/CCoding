// Test cho lib/stats.mjs theo suite-review §5 (SR-20, SR-04, SR-26, SR-25).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fisherYates, tost } from '../lib/stats.mjs';

const near = (x, y, e = 1e-9) => assert.ok(Math.abs(x - y) <= e, `${x} ≠ ${y}`);

test('SR-20 mulberry32: cùng hạt cho cùng chuỗi, khác hạt khác chuỗi, trong [0,1)', () => {
  const a = mulberry32(20261102), b = mulberry32(20261102), c = mulberry32(7);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('SR-20 fisherYates: không sửa mảng vào, là hoán vị, tái lập theo hạt', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const snap = [...src];
  const p1 = fisherYates(src, mulberry32(1)), p2 = fisherYates(src, mulberry32(1));
  assert.deepEqual(src, snap);
  assert.deepEqual(p1, p2);
  assert.deepEqual([...p1].sort((x, y) => x - y), snap);
});

// ---------- SR-04 ----------
const mk = (task, a, b) => ({ task, a, b });

test('SR-04 tost: chênh nhỏ, biến thiên nhỏ ⇒ tương đương trong ±0,05', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.70, 0.71, 0.69, 0.70], [0.71, 0.70, 0.70, 0.71]));
  const r = tost(cells, { margin: 0.05, seed: 1 });
  assert.equal(r.equivalent, true);
  assert.ok(r.lo90 > -0.05 && r.hi90 < 0.05);
  near(r.est, 0.005, 1e-9);
});

test('SR-04 tost: chênh +0,10 ⇒ ngoài biên, không tương đương', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.6, 0.7, 0.65], [0.8, 0.75, 0.8]));
  const r = tost(cells, { margin: 0.05, seed: 1 });
  assert.equal(r.equivalent, false);
  assert.ok(r.lo90 > 0.05);
});

test('SR-04 tost: biến thiên lớn ⇒ CI tràn biên dù est gần 0; tái lập theo hạt', () => {
  const cells = [mk('x', [0.1, 0.9], [0.9, 0.1]), mk('y', [0.2, 0.8], [0.8, 0.2])];
  const r1 = tost(cells, { margin: 0.05, seed: 3 }), r2 = tost(cells, { margin: 0.05, seed: 3 });
  assert.equal(r1.equivalent, false);
  assert.deepEqual(r1, r2);
});

test('SR-04 tost logratio: tỉ số ~1 trong ln(1,1) ⇒ tương đương; tỉ số 1,5 thì không', () => {
  const m = Math.log(1.1);
  const eq = tost(['x', 'y'].map((t) => mk(t, [100, 101, 99], [100, 100, 101])), { margin: m, scale: 'logratio', seed: 2 });
  assert.equal(eq.equivalent, true);
  const ne = tost(['x', 'y'].map((t) => mk(t, [100, 101, 99], [150, 151, 149])), { margin: m, scale: 'logratio', seed: 2 });
  assert.equal(ne.equivalent, false);
  near(ne.est, Math.log(1.5), 0.01);
});

test('SR-04 tost: không có ô hợp lệ ⇒ không tương đương, est NaN', () => {
  const r = tost([mk('x', [1], [])], { margin: 0.05 });
  assert.equal(r.equivalent, false);
  assert.ok(Number.isNaN(r.est));
});
