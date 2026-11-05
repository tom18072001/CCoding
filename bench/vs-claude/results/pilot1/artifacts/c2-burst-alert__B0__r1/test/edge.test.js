import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const mk = (tss, host = 'h', status = 500) => tss.map((ts) => ({ ts, host, status }));

test('(a) half-open window boundary', () => {
  assert.deepEqual(detectBursts(mk([0, 15000, 30000, 45000, 60000])), []);
  assert.deepEqual(detectBursts(mk([1, 15000, 30000, 45000, 60000])), [
    { host: 'h', ts: 60000, count: 5 },
  ]);
});

test('(b) cooldown boundary and counting of cooldown events', () => {
  const opts = { windowMs: 1000, threshold: 3, cooldownMs: 300 };
  // alert at 2; 100, 200, 301 are in cooldown (301 < 2 + 300); 302 is the first allowed.
  const r = detectBursts(mk([0, 1, 2, 100, 200, 301, 302]), opts);
  assert.deepEqual(r, [
    { host: 'h', ts: 2, count: 3 },
    { host: 'h', ts: 302, count: 7 },
  ]);
  const r2 = detectBursts(mk([0, 1, 2, 100, 200, 301]), opts);
  assert.deepEqual(r2, [{ host: 'h', ts: 2, count: 3 }]);
});

test('(c) default cooldown equals windowMs; explicit cooldown respected', () => {
  const ev = mk([0, 99, 100]);
  assert.deepEqual(detectBursts(ev, { windowMs: 100, threshold: 1 }), [
    { host: 'h', ts: 0, count: 1 },
    { host: 'h', ts: 100, count: 2 },
  ]);
  assert.deepEqual(detectBursts(ev, { windowMs: 100, threshold: 1, cooldownMs: 1 }), [
    { host: 'h', ts: 0, count: 1 },
    { host: 'h', ts: 99, count: 2 },
    { host: 'h', ts: 100, count: 2 },
  ]);
  assert.deepEqual(detectBursts(ev, { windowMs: 100, threshold: 1, cooldownMs: 1000 }), [
    { host: 'h', ts: 0, count: 1 },
  ]);
});

test('(d) equal ts: count grows in input order, alert records k not total', () => {
  const ev = mk([5, 5, 5, 5, 5]);
  assert.deepEqual(detectBursts(ev, { windowMs: 100, threshold: 3 }), [
    { host: 'h', ts: 5, count: 3 },
  ]);
  assert.deepEqual(detectBursts(ev, { windowMs: 100, threshold: 3, cooldownMs: 0 }), [
    { host: 'h', ts: 5, count: 3 },
    { host: 'h', ts: 5, count: 4 },
    { host: 'h', ts: 5, count: 5 },
  ]);
});

test('(e) unsorted input equals sorted input', () => {
  const sorted = mk([0, 1, 2, 100, 200, 301, 302]);
  const shuffled = [sorted[5], sorted[0], sorted[6], sorted[2], sorted[4], sorted[1], sorted[3]];
  const opts = { windowMs: 1000, threshold: 3, cooldownMs: 300 };
  assert.deepEqual(detectBursts(shuffled, opts), detectBursts(sorted, opts));
  assert.equal(detectBursts(shuffled, opts).length, 2);
});

test('(f) only 5xx counted', () => {
  const opts = { windowMs: 1000, threshold: 3 };
  const ev = [499, 600, 404, 200, 500, 599].map((status, i) => ({ ts: i, host: 'h', status }));
  assert.deepEqual(detectBursts(ev, opts), []);
  ev.push({ ts: 6, host: 'h', status: 503 });
  assert.deepEqual(detectBursts(ev, opts), [{ host: 'h', ts: 6, count: 3 }]);
});

test('(g) hosts independent; sorted by ts then host', () => {
  const opts = { windowMs: 1000, threshold: 2, cooldownMs: 5000 };
  const ev = [
    ...mk([10, 20], 'b'),
    ...mk([10, 20], 'a'),
    ...mk([30, 40], 'c'),
    ...mk([21, 22], 'a'), // in a's cooldown
  ];
  assert.deepEqual(detectBursts(ev, opts), [
    { host: 'a', ts: 20, count: 2 },
    { host: 'b', ts: 20, count: 2 },
    { host: 'c', ts: 40, count: 2 },
  ]);
});

test('(h) does not mutate input', () => {
  const ev = [...mk([300, 100, 200], 'z'), ...mk([5, 1], 'a'), { ts: 9, host: 'a', status: 404 }];
  const copy = structuredClone(ev);
  detectBursts(ev, { windowMs: 1000, threshold: 2 });
  assert.deepEqual(ev, copy);
});

test('(i) empty input and threshold = 1', () => {
  assert.deepEqual(detectBursts([]), []);
  assert.deepEqual(detectBursts(mk([0, 50, 100, 150, 200]), { windowMs: 100, threshold: 1 }), [
    { host: 'h', ts: 0, count: 1 },
    { host: 'h', ts: 100, count: 2 },
    { host: 'h', ts: 200, count: 2 },
  ]);
});
