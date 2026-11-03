import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

const ev = (tss, host = 'h', status = 500) => tss.map((ts) => ({ ts, host, status }));

test('(a) half-open boundary: exactly windowMs apart is excluded', () => {
  const o = { windowMs: 1000, threshold: 3 };
  assert.deepEqual(detectBursts(ev([0, 500, 1000]), o), [], 'ts=0 is outside (0,1000]');
  assert.deepEqual(detectBursts(ev([1, 500, 1000]), o), [{ host: 'h', ts: 1000, count: 3 }], 'windowMs-1 apart counts');
});

test('(b) threshold N fires, N-1 does not', () => {
  const o = { windowMs: 1000, threshold: 3 };
  assert.deepEqual(detectBursts(ev([10, 20]), o), []);
  assert.deepEqual(detectBursts(ev([10, 20, 30]), o), [{ host: 'h', ts: 30, count: 3 }]);
});

test('(c) cooldown: blocked before alert.ts+cooldown, fires at equality', () => {
  const o = { windowMs: 1000, threshold: 2, cooldownMs: 500 };
  // alert at 10 (count 2); 400 and 509 < 510 blocked; 510 fires with all 5 in window
  assert.deepEqual(detectBursts(ev([9, 10, 400, 509, 510]), o), [
    { host: 'h', ts: 10, count: 2 },
    { host: 'h', ts: 510, count: 5 },
  ]);
  assert.deepEqual(detectBursts(ev([9, 10, 509]), o), [{ host: 'h', ts: 10, count: 2 }]);
});

test('(c) events during cooldown still count toward later window', () => {
  const o = { windowMs: 1000, threshold: 3, cooldownMs: 600 };
  assert.deepEqual(detectBursts(ev([0, 1, 2, 300, 400, 700]), o), [
    { host: 'h', ts: 2, count: 3 },
    { host: 'h', ts: 700, count: 6 },
  ]);
});

test('(d) default cooldown equals windowMs', () => {
  const o = { windowMs: 1000, threshold: 2 };
  assert.deepEqual(detectBursts(ev([0, 1, 999, 1000]), o), [{ host: 'h', ts: 1, count: 2 }]);
  assert.deepEqual(detectBursts(ev([0, 1, 999, 1001]), o), [
    { host: 'h', ts: 1, count: 2 },
    { host: 'h', ts: 1001, count: 2 },
  ]);
});

test('(e) unsorted input is ordered by ts', () => {
  assert.deepEqual(detectBursts(ev([4000, 0, 3000, 1000, 2000])), [{ host: 'h', ts: 4000, count: 5 }]);
});

test('(f) equal ts: each counts as processed, one alert then cooldown', () => {
  const o = { windowMs: 1000, threshold: 3 };
  assert.deepEqual(detectBursts(ev([100, 100, 100, 100]), o), [{ host: 'h', ts: 100, count: 3 }]);
  assert.deepEqual(detectBursts(ev([100, 100]), o), []);
});

test('(g) hosts are independent; sorted by ts then host', () => {
  const o = { windowMs: 1000, threshold: 2 };
  const events = [
    { ts: 5, host: 'b', status: 500 },
    { ts: 5, host: 'a', status: 503 },
    { ts: 1, host: 'a', status: 500 },
    { ts: 1, host: 'b', status: 502 },
    { ts: 3, host: 'c', status: 500 },
    { ts: 9, host: 'c', status: 500 },
  ];
  assert.deepEqual(detectBursts(events, o), [
    { host: 'a', ts: 5, count: 2 },
    { host: 'b', ts: 5, count: 2 },
    { host: 'c', ts: 9, count: 2 },
  ]);
  assert.deepEqual(
    detectBursts([{ ts: 1, host: 'a', status: 500 }, { ts: 2, host: 'b', status: 500 }], o),
    []
  );
});

test('(h) non-5xx and non-numeric statuses ignored', () => {
  const o = { windowMs: 1000, threshold: 2 };
  const mk = (s) => [{ ts: 1, host: 'h', status: 500 }, { ts: 2, host: 'h', status: s }];
  for (const s of [499, 600, 200, '500', null, undefined, NaN, 'abc']) {
    assert.deepEqual(detectBursts(mk(s), o), [], `status ${String(s)}`);
  }
  assert.deepEqual(detectBursts(mk(599), o), [{ host: 'h', ts: 2, count: 2 }]);
  assert.deepEqual(detectBursts(mk(500), o), [{ host: 'h', ts: 2, count: 2 }]);
});

test('(i) input and opts not mutated', () => {
  const events = ev([4000, 0, 3000, 1000, 2000]);
  const opts = { windowMs: 60000, threshold: 5 };
  const evCopy = structuredClone(events);
  const optCopy = structuredClone(opts);
  detectBursts(events, opts);
  assert.deepEqual(events, evCopy);
  assert.deepEqual(opts, optCopy);
});

test('(j) empty array', () => {
  assert.deepEqual(detectBursts([]), []);
});
