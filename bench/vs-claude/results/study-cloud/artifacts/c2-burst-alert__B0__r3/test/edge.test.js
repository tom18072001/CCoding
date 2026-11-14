import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const ev = (host, status, ...tss) => tss.map((ts) => ({ ts, host, status }));

test('(a) unsorted input', () => {
  const e = ev('a', 500, 4000, 0, 3000, 1000, 2000);
  assert.deepEqual(detectBursts(e), [{ host: 'a', ts: 4000, count: 5 }]);
});

test('(b) window boundary is half-open', () => {
  // ts 100, window 100: event at 0 (== ts - windowMs) is excluded -> count 4 < 5
  assert.deepEqual(detectBursts(ev('a', 500, 0, 10, 20, 30, 100), { windowMs: 100, threshold: 5 }), []);
  // event at 1 (== ts - windowMs + 1) is included -> count 5
  assert.deepEqual(detectBursts(ev('a', 500, 1, 10, 20, 30, 100), { windowMs: 100, threshold: 5 }), [
    { host: 'a', ts: 100, count: 5 },
  ]);
});

test('(c) status filtering', () => {
  const e = [
    { ts: 1, host: 'a', status: 200 },
    { ts: 2, host: 'a', status: 404 },
    { ts: 3, host: 'a', status: 499 },
    { ts: 4, host: 'a', status: 600 },
    { ts: 5, host: 'a', status: 500 },
    { ts: 6, host: 'a', status: 599 },
  ];
  assert.deepEqual(detectBursts(e, { threshold: 2 }), [{ host: 'a', ts: 6, count: 2 }]);
  assert.deepEqual(detectBursts(e, { threshold: 3 }), []);
});

test('(d) hosts independent; ties sorted by host', () => {
  const e = [...ev('b', 500, 1, 2), ...ev('a', 503, 1, 2), ...ev('c', 500, 1), ...ev('a', 200, 3)];
  assert.deepEqual(detectBursts(e, { threshold: 2 }), [
    { host: 'a', ts: 2, count: 2 },
    { host: 'b', ts: 2, count: 2 },
  ]);
  const e2 = [...ev('b', 500, 5, 6), ...ev('a', 500, 1, 6)];
  assert.deepEqual(detectBursts(e2, { threshold: 2, windowMs: 10 }), [
    { host: 'a', ts: 6, count: 2 },
    { host: 'b', ts: 6, count: 2 },
  ]);
});

test('(e) cooldown boundaries and counting during cooldown', () => {
  // threshold 2, window 100, cooldown 50. alert at 10 (events 0,10).
  const base = ev('a', 500, 0, 10);
  // 59 < 10+50 -> no alert
  assert.deepEqual(detectBursts([...base, ...ev('a', 500, 59)], { windowMs: 100, threshold: 2, cooldownMs: 50 }), [
    { host: 'a', ts: 10, count: 2 },
  ]);
  // 60 == 10+50 -> alert, window (-40,60] holds 0,10,60 -> count 3 (cooldown events count)
  assert.deepEqual(
    detectBursts([...base, ...ev('a', 500, 30, 60)], { windowMs: 100, threshold: 2, cooldownMs: 50 }),
    [
      { host: 'a', ts: 10, count: 2 },
      { host: 'a', ts: 60, count: 4 },
    ],
  );
});

test('(f) default cooldown = windowMs; explicit cooldownMs 0', () => {
  const e = ev('a', 500, 0, 10, 50, 109, 110);
  // window 100, threshold 2: alert at 10; cooldown until 110 -> 50,109 suppressed; 110 alerts
  // window (10,110] = 50,109,110 -> count 3
  assert.deepEqual(detectBursts(e, { windowMs: 100, threshold: 2 }), [
    { host: 'a', ts: 10, count: 2 },
    { host: 'a', ts: 110, count: 3 },
  ]);
  // cooldown 0: every qualifying event alerts
  assert.deepEqual(detectBursts(ev('a', 500, 0, 10, 20), { windowMs: 100, threshold: 2, cooldownMs: 0 }), [
    { host: 'a', ts: 10, count: 2 },
    { host: 'a', ts: 20, count: 3 },
  ]);
});

test('(g) equal ts processed in input order', () => {
  assert.deepEqual(detectBursts(ev('a', 500, 7, 7, 7), { threshold: 3 }), [{ host: 'a', ts: 7, count: 3 }]);
  assert.deepEqual(detectBursts(ev('a', 500, 7, 7, 7, 7), { threshold: 3 }), [{ host: 'a', ts: 7, count: 3 }]);
});

test('(h) input not mutated', () => {
  const e = [...ev('b', 500, 30, 10), ...ev('a', 500, 20, 5), { ts: 1, host: 'a', status: 200 }];
  const before = structuredClone(e);
  const refs = [...e];
  detectBursts(e, { threshold: 2 });
  assert.deepEqual(e, before);
  e.forEach((x, i) => assert.equal(x, refs[i]));
});

test('(i) empty input', () => {
  assert.deepEqual(detectBursts([]), []);
});

test('(j) threshold 1', () => {
  // cooldown defaults to window (100): alert at 0, suppressed at 50, alert at 100
  assert.deepEqual(detectBursts(ev('a', 500, 0, 50, 100), { windowMs: 100, threshold: 1 }), [
    { host: 'a', ts: 0, count: 1 },
    { host: 'a', ts: 100, count: 2 },
  ]);
});
