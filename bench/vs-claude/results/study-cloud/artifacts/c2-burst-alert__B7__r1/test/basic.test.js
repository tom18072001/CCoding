import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBursts } from '../src/alert.js';

test('five 5xx within a minute fire one alert', () => {
  const ev = [0, 1000, 2000, 3000, 4000].map((ts) => ({ ts, host: 'web1', status: 500 }));
  assert.deepEqual(detectBursts(ev), [{ host: 'web1', ts: 4000, count: 5 }]);
});
