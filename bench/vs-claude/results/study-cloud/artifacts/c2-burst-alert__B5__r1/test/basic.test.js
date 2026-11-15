import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

test('five 5xx within a minute fire one alert', () => {
  const ev = [0, 1000, 2000, 3000, 4000].map((ts) => ({ ts, host: 'web1', status: 500 }));
  assert.deepEqual(detectBursts(ev), [{ host: 'web1', ts: 4000, count: 5 }]);
});

const mk = (host, tss, status = 500) => tss.map((ts) => ({ ts, host, status }));

test('window is half-open, unsorted input, non-5xx ignored, input not mutated', () => {
  const ev = [...mk('a', [4000, 0, 3000, 2000, 1000]), { ts: 500, host: 'a', status: 404 }];
  const copy = JSON.parse(JSON.stringify(ev));
  assert.deepEqual(detectBursts(ev, { windowMs: 4000 }), []); // ts 0 excluded at 4000
  assert.deepEqual(detectBursts(ev, { windowMs: 4001 }), [{ host: 'a', ts: 4000, count: 5 }]);
  assert.deepEqual(ev, copy);
});

test('cooldown suppresses, counts persist, hosts independent, sorted output', () => {
  const ev = [...mk('b', [0, 1, 2, 3, 4, 5, 6, 100]), ...mk('a', [0, 1, 2, 3, 4])];
  const r = detectBursts(ev, { windowMs: 1000, threshold: 5, cooldownMs: 50 });
  assert.deepEqual(r, [
    { host: 'a', ts: 4, count: 5 },
    { host: 'b', ts: 4, count: 5 },
    { host: 'b', ts: 100, count: 8 },
  ]);
  const r3 = detectBursts(mk('b', [0, 1, 2, 3, 4, 54]), { windowMs: 1000, cooldownMs: 50 });
  assert.deepEqual(r3.map((x) => [x.ts, x.count]), [[4, 5], [54, 6]]);
});

test('equal ts processed one by one', () => {
  assert.deepEqual(detectBursts(mk('a', [7, 7, 7]), { threshold: 2 }), [{ host: 'a', ts: 7, count: 2 }]);
});
