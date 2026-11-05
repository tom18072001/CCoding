import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const mk = (host, status, ...tss) => tss.map((ts) => ({ ts, host, status }));
const o = (threshold, windowMs, cooldownMs) => ({ threshold, windowMs, cooldownMs });

test('only 5xx counted: 499 and 600 ignored, 500 and 599 counted', () => {
  const ev = [...mk('a', 499, 1, 2), ...mk('a', 600, 3, 4), ...mk('a', 500, 5), ...mk('a', 599, 6)];
  assert.deepEqual(detectBursts(ev, o(2, 100)), [{ host: 'a', ts: 6, count: 2 }]);
  assert.deepEqual(detectBursts(ev, o(3, 100)), []);
});

test('half-open window: event at ts - windowMs is excluded', () => {
  const ev = mk('a', 500, 0, 10, 20);
  assert.deepEqual(detectBursts(ev, o(3, 20)), []);
  assert.deepEqual(detectBursts(ev, o(3, 21)), [{ host: 'a', ts: 20, count: 3 }]);
});

test('hosts are independent', () => {
  const ev = [...mk('a', 500, 1, 2), ...mk('b', 500, 3, 4)];
  assert.deepEqual(detectBursts(ev, o(3, 100)), []);
  const ev2 = [...mk('a', 500, 1, 2, 5), ...mk('b', 500, 3, 4)];
  assert.deepEqual(detectBursts(ev2, o(3, 100)), [{ host: 'a', ts: 5, count: 3 }]);
});

test('cooldown blocks ts < alert.ts + cooldownMs, allows exactly at boundary', () => {
  // alert at ts=2; cooldown 10 => blocked until ts<12
  const blocked = mk('a', 500, 0, 1, 2, 3, 11);
  assert.deepEqual(detectBursts(blocked, o(3, 1000, 10)), [{ host: 'a', ts: 2, count: 3 }]);
  const at = mk('a', 500, 0, 1, 2, 3, 12);
  assert.deepEqual(detectBursts(at, o(3, 1000, 10)), [
    { host: 'a', ts: 2, count: 3 },
    { host: 'a', ts: 12, count: 5 },
  ]);
});

test('events during cooldown still count toward later windows', () => {
  const ev = mk('a', 500, 0, 1, 2, 5, 6, 7, 8);
  assert.deepEqual(detectBursts(ev, o(3, 100, 6)), [
    { host: 'a', ts: 2, count: 3 },
    { host: 'a', ts: 8, count: 7 },
  ]);
});

test('same ts processed in input order, each counted as processed', () => {
  const ev = mk('a', 500, 5, 5, 5, 5);
  assert.deepEqual(detectBursts(ev, o(3, 100, 0)), [
    { host: 'a', ts: 5, count: 3 },
    { host: 'a', ts: 5, count: 4 },
  ]);
  assert.deepEqual(detectBursts(ev, o(3, 100)), [{ host: 'a', ts: 5, count: 3 }]);
});

test('unsorted input gives same result as sorted', () => {
  const sorted = mk('a', 500, 1, 2, 3, 4);
  const shuffled = [sorted[3], sorted[0], sorted[2], sorted[1]];
  assert.deepEqual(detectBursts(shuffled, o(3, 100)), detectBursts(sorted, o(3, 100)));
  assert.deepEqual(detectBursts(shuffled, o(3, 100)), [{ host: 'a', ts: 3, count: 3 }]);
});

test('results sorted by ts then host', () => {
  const ev = [...mk('b', 500, 1, 2, 10), ...mk('a', 500, 1, 2, 10), ...mk('c', 500, 1, 2, 5)];
  assert.deepEqual(detectBursts(ev, o(3, 100)).map((x) => [x.ts, x.host]), [
    [5, 'c'], [10, 'a'], [10, 'b'],
  ]);
});

test('does not mutate input', () => {
  const ev = [...mk('b', 500, 9, 3, 1), ...mk('a', 503, 2, 2), ...mk('a', 404, 1)];
  const copy = structuredClone(ev);
  detectBursts(ev, o(2, 100));
  assert.deepEqual(ev, copy);
});

test('defaults: threshold 5, window 60000, cooldown = window', () => {
  assert.deepEqual(detectBursts(mk('a', 500, 0, 1, 2, 3)), []);
  assert.deepEqual(detectBursts(mk('a', 500, 0, 1, 2, 3, 4)), [{ host: 'a', ts: 4, count: 5 }]);
  // window default: event at 0 falls out at 60000
  assert.deepEqual(detectBursts(mk('a', 500, 0, 1, 2, 3, 60000)), []);
  assert.equal(detectBursts(mk('a', 500, 1, 2, 3, 4, 60000)).length, 1);
  // default cooldown 60000: alert at 4, next allowed at 60004
  const ev = mk('a', 500, 0, 1, 2, 3, 4, 59999, 60000, 60001, 60002, 60003, 60004);
  assert.deepEqual(detectBursts(ev).map((x) => x.ts), [4, 60004]);
});
