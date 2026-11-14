import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const ev = (host, status, ...tss) => tss.map((ts) => ({ ts, host, status }));

test('empty input yields no alerts', () => {
  assert.deepEqual(detectBursts([]), []);
});

test('half-open window: event exactly windowMs earlier is not counted', () => {
  const o = { windowMs: 1000, threshold: 3 };
  assert.deepEqual(detectBursts(ev('h', 500, 0, 500, 1000), o), []);
  assert.deepEqual(detectBursts(ev('h', 500, 0, 500, 999), o), [{ host: 'h', ts: 999, count: 3 }]);
  assert.deepEqual(detectBursts(ev('h', 500, 0, 500, 1000, 1001), o), [{ host: 'h', ts: 1001, count: 3 }]);
});

test('default opts: windowMs 60000, threshold 5', () => {
  assert.deepEqual(detectBursts(ev('h', 503, 0, 15000, 30000, 45000, 60000)), []);
  assert.deepEqual(detectBursts(ev('h', 503, 0, 15000, 30000, 45000, 59999)), [{ host: 'h', ts: 59999, count: 5 }]);
  assert.deepEqual(detectBursts(ev('h', 503, 0, 1, 2, 3)), []);
});

test('custom threshold and windowMs', () => {
  assert.deepEqual(detectBursts(ev('h', 500, 0, 10), { windowMs: 100, threshold: 2 }), [{ host: 'h', ts: 10, count: 2 }]);
  assert.deepEqual(detectBursts(ev('h', 500, 0, 10), { windowMs: 100, threshold: 3 }), []);
});

test('cooldown: suppressed before alert.ts+cooldownMs, fires at equality, in-cooldown events still count', () => {
  const r = detectBursts(ev('h', 500, 0, 1, 500, 1000, 1001), { windowMs: 10000, threshold: 2, cooldownMs: 1000 });
  assert.deepEqual(r, [
    { host: 'h', ts: 1, count: 2 },
    { host: 'h', ts: 1001, count: 5 },
  ]);
});

test('cooldown defaults to windowMs', () => {
  const r = detectBursts(ev('h', 500, 0, 1, 50, 100, 101), { windowMs: 100, threshold: 2 });
  // alert at 1; 50 and 100 are in cooldown (<101); at 101 window (1,101] = 50,100,101
  assert.deepEqual(r, [
    { host: 'h', ts: 1, count: 2 },
    { host: 'h', ts: 101, count: 3 },
  ]);
});

test('cooldownMs 0 allows consecutive alerts', () => {
  const r = detectBursts(ev('h', 500, 0, 10, 20), { windowMs: 100, threshold: 2, cooldownMs: 0 });
  assert.deepEqual(r, [
    { host: 'h', ts: 10, count: 2 },
    { host: 'h', ts: 20, count: 3 },
  ]);
});

test('hosts are independent (counts and cooldowns)', () => {
  const events = [...ev('a', 500, 0, 2), ...ev('b', 500, 1, 3)].sort((x, y) => x.ts - y.ts);
  assert.deepEqual(detectBursts(events, { windowMs: 100, threshold: 2 }), [
    { host: 'a', ts: 2, count: 2 },
    { host: 'b', ts: 3, count: 2 },
  ]);
  // events of different hosts do not add up to a burst
  assert.deepEqual(detectBursts([...ev('a', 500, 0), ...ev('b', 500, 1)], { windowMs: 100, threshold: 2 }), []);
});

test('unsorted input gives the same result as sorted', () => {
  assert.deepEqual(detectBursts(ev('h', 500, 4000, 0, 3000, 1000, 2000)), [{ host: 'h', ts: 4000, count: 5 }]);
});

test('equal ts are processed in input order, each counts as processed', () => {
  const r = detectBursts(ev('h', 500, 7, 7, 7, 7), { windowMs: 100, threshold: 3 });
  assert.deepEqual(r, [{ host: 'h', ts: 7, count: 3 }]); // 4th is in cooldown
  const r2 = detectBursts(ev('h', 500, 7, 7, 7, 7), { windowMs: 100, threshold: 3, cooldownMs: 0 });
  assert.deepEqual(r2, [
    { host: 'h', ts: 7, count: 3 },
    { host: 'h', ts: 7, count: 4 },
  ]);
});

test('only 500-599 counts: 499, 600, 2xx ignored', () => {
  const o = { windowMs: 1000, threshold: 3 };
  const mixed = [
    { ts: 1, host: 'h', status: 499 },
    { ts: 2, host: 'h', status: 600 },
    { ts: 3, host: 'h', status: 200 },
    { ts: 4, host: 'h', status: 204 },
    { ts: 5, host: 'h', status: 500 },
    { ts: 6, host: 'h', status: 599 },
  ];
  assert.deepEqual(detectBursts(mixed, o), []);
  mixed.push({ ts: 7, host: 'h', status: 550 });
  assert.deepEqual(detectBursts(mixed, o), [{ host: 'h', ts: 7, count: 3 }]);
});

test('count reflects all events in window at trigger time', () => {
  const r = detectBursts(ev('h', 500, 0, 1, 2, 3, 4, 5, 6), { windowMs: 100, threshold: 7 });
  assert.deepEqual(r, [{ host: 'h', ts: 6, count: 7 }]);
});

test('results sorted by ts then host ascending', () => {
  const events = [...ev('zeta', 500, 0, 10), ...ev('alpha', 500, 5, 10), ...ev('mid', 500, 1, 3)];
  assert.deepEqual(detectBursts(events, { windowMs: 100, threshold: 2 }), [
    { host: 'mid', ts: 3, count: 2 },
    { host: 'alpha', ts: 10, count: 2 },
    { host: 'zeta', ts: 10, count: 2 },
  ]);
});

test('input is not mutated', () => {
  const events = Object.freeze(
    ev('b', 500, 30, 10, 20).concat(ev('a', 503, 5, 1)).map((e) => Object.freeze(e))
  );
  const copy = JSON.parse(JSON.stringify(events));
  const opts = Object.freeze({ windowMs: 100, threshold: 2 });
  detectBursts(events, opts);
  assert.deepEqual(events, copy);
  assert.deepEqual(opts, { windowMs: 100, threshold: 2 });
});
