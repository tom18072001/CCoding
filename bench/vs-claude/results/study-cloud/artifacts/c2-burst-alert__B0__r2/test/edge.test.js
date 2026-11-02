import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const mk = (tss, host = 'a', status = 500) => tss.map((ts) => ({ ts, host, status }));

test('(a) half-open window: ts - windowMs excluded', () => {
  assert.deepEqual(detectBursts(mk([0, 1, 2, 3, 10]), { windowMs: 10, threshold: 5 }), []);
});
test('(a) half-open window: ts - windowMs + 1 included', () => {
  assert.deepEqual(detectBursts(mk([1, 2, 3, 4, 10]), { windowMs: 10, threshold: 5 }), [
    { host: 'a', ts: 10, count: 5 },
  ]);
});

test('(b) cooldown boundary: alert.ts + cooldownMs - 1 blocked', () => {
  const o = { windowMs: 100, threshold: 2, cooldownMs: 10 };
  assert.deepEqual(detectBursts(mk([0, 0, 9]), o), [{ host: 'a', ts: 0, count: 2 }]);
});
test('(b) cooldown boundary: alert.ts + cooldownMs fires', () => {
  const o = { windowMs: 100, threshold: 2, cooldownMs: 10 };
  assert.deepEqual(detectBursts(mk([0, 0, 9, 10]), o), [
    { host: 'a', ts: 0, count: 2 },
    { host: 'a', ts: 10, count: 4 },
  ]);
});

test('(c) cooldown events still count toward later windows', () => {
  const o = { windowMs: 100, threshold: 2, cooldownMs: 20 };
  // alert at ts 1 (count 2); 5 and 10 and 20 blocked (< 21); 21 fires with all 6... events: 0,1,5,10,20,21
  assert.deepEqual(detectBursts(mk([0, 1, 5, 10, 20, 21]), o), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'a', ts: 21, count: 6 },
  ]);
});

test('(d) equal ts: alert at the event reaching threshold', () => {
  assert.deepEqual(detectBursts(mk([5, 5, 5, 5]), { threshold: 3 }), [
    { host: 'a', ts: 5, count: 3 },
  ]);
});
test('(d) equal ts with cooldownMs=0: later events also fire', () => {
  assert.deepEqual(detectBursts(mk([5, 5, 5, 5]), { threshold: 2, cooldownMs: 0 }), [
    { host: 'a', ts: 5, count: 2 },
    { host: 'a', ts: 5, count: 3 },
    { host: 'a', ts: 5, count: 4 },
  ]);
});

test('(e) unsorted input equals sorted input', () => {
  const sorted = [...mk([0, 1, 2, 3, 4], 'a'), ...mk([2, 3, 4, 5, 6], 'b')].sort(
    (x, y) => x.ts - y.ts,
  );
  const order = [7, 0, 9, 3, 1, 8, 2, 6, 5, 4];
  const shuffled = order.map((i) => sorted[i]);
  const expected = [
    { host: 'a', ts: 4, count: 5 },
    { host: 'b', ts: 6, count: 5 },
  ];
  assert.deepEqual(detectBursts(sorted), expected);
  assert.deepEqual(detectBursts(shuffled), expected);
});

test('(f) same ts across hosts ordered by host asc', () => {
  const ev = [...mk([0, 1, 2, 3, 4], 'zeta'), ...mk([0, 1, 2, 3, 4], 'alpha')];
  assert.deepEqual(detectBursts(ev), [
    { host: 'alpha', ts: 4, count: 5 },
    { host: 'zeta', ts: 4, count: 5 },
  ]);
});
test('(f) one host cooldown does not block another', () => {
  const ev = [...mk([0, 1], 'a'), ...mk([2, 3], 'b'), ...mk([4], 'a')];
  assert.deepEqual(detectBursts(ev, { threshold: 2, cooldownMs: 1000 }), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'b', ts: 3, count: 2 },
  ]);
});

test('(g) 499 and 600 ignored; 500 and 599 counted', () => {
  const st = (s) => [0, 1, 2].map((ts) => ({ ts, host: 'a', status: s }));
  assert.deepEqual(detectBursts(st(499), { threshold: 3 }), []);
  assert.deepEqual(detectBursts(st(600), { threshold: 3 }), []);
  assert.deepEqual(detectBursts(st(500), { threshold: 3 }), [{ host: 'a', ts: 2, count: 3 }]);
  assert.deepEqual(detectBursts(st(599), { threshold: 3 }), [{ host: 'a', ts: 2, count: 3 }]);
  const mixed = [
    { ts: 0, host: 'a', status: 500 },
    { ts: 1, host: 'a', status: 499 },
    { ts: 2, host: 'a', status: 600 },
    { ts: 3, host: 'a', status: 599 },
  ];
  assert.deepEqual(detectBursts(mixed, { threshold: 2 }), [{ host: 'a', ts: 3, count: 2 }]);
});

test('(h) input not mutated', () => {
  const ev = [4, 0, 3, 1, 2, 9].map((ts, i) => ({ ts, host: i % 2 ? 'b' : 'a', status: 500 }));
  const snap = structuredClone(ev);
  const refs = ev.slice();
  detectBursts(ev, { threshold: 2 });
  assert.deepEqual(ev, snap);
  ev.forEach((e, i) => assert.equal(e, refs[i]));
});

test('(i) option overrides', () => {
  const ev = mk([0, 30000, 60000]);
  // default window 60000: ts 0 excluded at 60000 -> count 2 -> no alert at threshold 3
  assert.deepEqual(detectBursts(ev, { threshold: 3 }), []);
  assert.deepEqual(detectBursts(ev, { threshold: 3, windowMs: 60001 }), [
    { host: 'a', ts: 60000, count: 3 },
  ]);
  // threshold 2: alert at 30000; 60000 blocked by default cooldown (< 90000)
  assert.deepEqual(detectBursts(ev, { threshold: 2 }), [{ host: 'a', ts: 30000, count: 2 }]);
});
test('(i) cooldownMs defaults to windowMs when only windowMs given', () => {
  const ev = mk([0, 1, 9, 11]);
  // alert at 1; 9 blocked (< 11); 11 fires, window (1,11] = {9, 11}
  assert.deepEqual(detectBursts(ev, { windowMs: 10, threshold: 2 }), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'a', ts: 11, count: 2 },
  ]);
  // explicit cooldownMs overrides: 9 >= 1 + 5 fires with {0,1,9}; 11 blocked (< 14)
  assert.deepEqual(detectBursts(ev, { windowMs: 10, threshold: 2, cooldownMs: 5 }), [
    { host: 'a', ts: 1, count: 2 },
    { host: 'a', ts: 9, count: 3 },
  ]);
});

test('(j) empty array returns []', () => {
  assert.deepEqual(detectBursts([]), []);
});
