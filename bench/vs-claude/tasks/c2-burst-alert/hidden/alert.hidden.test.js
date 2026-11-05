import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';
const ev = (host, status, ...ts) => ts.map((t) => ({ ts: t, host, status }));

test('window is half-open: event exactly windowMs old drops out', () => {
  const e = ev('a', 503, 0, 15000, 30000, 45000, 60000);
  assert.deepEqual(detectBursts(e), []);
  assert.deepEqual(detectBursts(e.concat(ev('a', 503, 60001))), [{ host: 'a', ts: 60001, count: 5 }]);
});
test('ignores non-5xx, including 499 and 600', () => {
  const e = [...ev('a', 404, 1, 2, 3), ...ev('a', 499, 4), ...ev('a', 600, 5), ...ev('a', 500, 6, 7, 8, 9)];
  assert.deepEqual(detectBursts(e), []);
});
test('unsorted input and no mutation', () => {
  const e = ev('a', 500, 4000, 0, 3000, 1000, 2000);
  const copy = JSON.parse(JSON.stringify(e));
  assert.deepEqual(detectBursts(e), [{ host: 'a', ts: 4000, count: 5 }]);
  assert.deepEqual(e, copy);
});
test('cooldown suppresses, but events still count afterward', () => {
  const e = ev('a', 500, 0, 1, 2, 3, 4, 59990, 59991, 59992, 59993, 60004);
  assert.deepEqual(detectBursts(e), [{ host: 'a', ts: 4, count: 5 }, { host: 'a', ts: 60004, count: 5 }]);
});
test('hosts are independent and output sorted by ts then host', () => {
  const e = [...ev('b', 502, 0, 1, 2), ...ev('a', 502, 0, 1, 2)];
  assert.deepEqual(detectBursts(e, { threshold: 3 }), [{ host: 'a', ts: 2, count: 3 }, { host: 'b', ts: 2, count: 3 }]);
});
test('custom window, threshold, cooldown', () => {
  const e = ev('x', 500, 0, 10, 20, 30, 40, 50);
  assert.deepEqual(detectBursts(e, { windowMs: 25, threshold: 2, cooldownMs: 15 }), [
    { host: 'x', ts: 10, count: 2 }, { host: 'x', ts: 30, count: 3 }, { host: 'x', ts: 50, count: 3 }]);
});
test('equal timestamps count in input order', () => {
  const e = ev('a', 500, 7, 7, 7);
  assert.deepEqual(detectBursts(e, { threshold: 2 }), [{ host: 'a', ts: 7, count: 2 }]);
});
