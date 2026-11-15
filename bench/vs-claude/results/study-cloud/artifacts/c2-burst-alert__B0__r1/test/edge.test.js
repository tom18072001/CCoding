import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const mk = (tss, host = 'a', status = 500) => tss.map((ts) => ({ ts, host, status }));

test('1) event at exactly ts - windowMs is outside the window', () => {
  assert.deepEqual(detectBursts(mk([0, 1000, 2000, 3000, 60000])), []);
  assert.deepEqual(detectBursts(mk([1, 1000, 2000, 3000, 60000])), [{ host: 'a', ts: 60000, count: 5 }]);
});

test('2) only 500..599 count', () => {
  const ev = [200, 404, 600, 499, 500].map((status, i) => ({ ts: i, host: 'a', status }));
  assert.deepEqual(detectBursts(ev, { threshold: 2 }), []);
  const ev2 = [500, 599].map((status, i) => ({ ts: i, host: 'a', status }));
  assert.deepEqual(detectBursts(ev2, { threshold: 2 }), [{ host: 'a', ts: 1, count: 2 }]);
});

test('3) unsorted input equals sorted input', () => {
  const sorted = mk([0, 10, 20, 30, 40, 100, 110, 120, 130, 140]);
  const shuffled = [7, 2, 9, 0, 5, 1, 8, 3, 6, 4].map((i) => sorted[i]);
  const o = { windowMs: 50, threshold: 5, cooldownMs: 50 };
  const exp = detectBursts(sorted, o);
  assert.deepEqual(exp, [{ host: 'a', ts: 40, count: 5 }, { host: 'a', ts: 140, count: 5 }]);
  assert.deepEqual(detectBursts(shuffled, o), exp);
});

test('4) hosts independent; output sorted by ts then host', () => {
  const ev = [...mk([0, 1, 2], 'b'), ...mk([0, 1, 2], 'a'), ...mk([5, 6, 7], 'c')];
  assert.deepEqual(detectBursts(ev, { threshold: 3 }), [
    { host: 'a', ts: 2, count: 3 },
    { host: 'b', ts: 2, count: 3 },
    { host: 'c', ts: 7, count: 3 },
  ]);
  const ev2 = [...mk([10, 11], 'a'), ...mk([0, 1], 'z')];
  assert.deepEqual(detectBursts(ev2, { threshold: 2 }), [
    { host: 'z', ts: 1, count: 2 },
    { host: 'a', ts: 11, count: 2 },
  ]);
});

test('5) cooldown boundary; later count includes cooldown events', () => {
  const o = { windowMs: 1000, threshold: 2, cooldownMs: 100 };
  // alert at ts 1; ts 100 = t + cooldown - 1 is blocked; ts 101 fires again
  assert.deepEqual(detectBursts(mk([0, 1, 50, 100]), o), [{ host: 'a', ts: 1, count: 2 }]);
  assert.deepEqual(detectBursts(mk([0, 1, 50, 100, 101]), o), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'a', ts: 101, count: 5 },
  ]);
});

test('6) default cooldown equals custom windowMs', () => {
  const o = { windowMs: 10000, threshold: 2 };
  // alert at 1; ts 10000 = t + 9999 blocked; ts 10001 = t + windowMs fires, window (1, 10001] holds 10000 and 10001
  assert.deepEqual(detectBursts(mk([0, 1, 10000]), o), [{ host: 'a', ts: 1, count: 2 }]);
  assert.deepEqual(detectBursts(mk([0, 1, 10000, 10001]), o), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'a', ts: 10001, count: 2 },
  ]);
});

test('7) equal ts in same host', () => {
  const five = mk([0, 0, 0, 0, 0]);
  assert.deepEqual(detectBursts(five), [{ host: 'a', ts: 0, count: 5 }]);
  assert.deepEqual(detectBursts(five, { threshold: 3 }), [{ host: 'a', ts: 0, count: 3 }]);
});

test('8) cooldownMs = 0 alerts on every qualifying event, including equal ts', () => {
  assert.deepEqual(detectBursts(mk([0, 0, 0, 0]), { threshold: 2, cooldownMs: 0 }), [
    { host: 'a', ts: 0, count: 2 },
    { host: 'a', ts: 0, count: 3 },
    { host: 'a', ts: 0, count: 4 },
  ]);
});

test('9) input is not mutated', () => {
  const ev = [30, 10, 20, 0, 5].map((ts, i) => ({ ts, host: i % 2 ? 'b' : 'a', status: i === 3 ? 404 : 500 }));
  const before = structuredClone(ev);
  detectBursts(ev, { threshold: 2 });
  assert.deepEqual(ev, before);
});

test('10) empty and non-5xx input return []', () => {
  assert.deepEqual(detectBursts([]), []);
  assert.deepEqual(detectBursts(mk([0, 1, 2, 3, 4, 5], 'a', 404)), []);
  assert.deepEqual(detectBursts(mk([0, 1, 2, 3, 4, 5], 'a', 200)), []);
});
