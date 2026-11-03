// Test cho lib/stats.mjs theo suite-review §5 (SR-20, SR-04, SR-26, SR-25).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fisherYates } from '../lib/stats.mjs';

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
