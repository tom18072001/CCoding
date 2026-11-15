'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg');

const R = [
  { a: 'x', n: 1, s: '2.5' }, { a: 'y', n: 3 }, { a: 'x', n: 'abc' }, { a: null, n: 10 }, { n: 7 },
];

test('count / count by', () => {
  assert.deepStrictEqual(aggregate(R, ' count '), { type: 'count', value: 5 });
  assert.deepStrictEqual(aggregate(R, 'count by a'), {
    type: 'count_by', field: 'a', buckets: [{ key: 'x', count: 2 }, { key: 'y', count: 1 }] });
});

test('key kinds kept, ties by String(key)', () => {
  const r = aggregate([{ k: 10 }, { k: 9 }, { k: '9' }], 'count by k');
  assert.deepStrictEqual(r.buckets, [{ key: 10, count: 1 }, { key: 9, count: 1 }, { key: '9', count: 1 }]);
});

test('top', () => {
  assert.deepStrictEqual(aggregate(R, 'top 1 a'), { type: 'top', field: 'a', buckets: [{ key: 'x', count: 2 }] });
});

test('sum avg min max', () => {
  assert.strictEqual(aggregate(R, 'sum n').value, 21);
  assert.strictEqual(aggregate([{ n: 1 }, { n: 1 }, { n: 2 }], 'avg n').value, 1.3333);
  assert.strictEqual(aggregate(R, 'min n').value, 1);
  assert.strictEqual(aggregate(R, 'max n').value, 10);
  assert.strictEqual(aggregate(R, 'max s').value, 2.5);
  assert.deepStrictEqual(aggregate(R, 'sum zz'), { type: 'sum', field: 'zz', value: null });
});

test('percentiles nearest-rank', () => {
  const rs = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepStrictEqual(aggregate(rs, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.strictEqual(aggregate(rs, 'p95 v').value, 10);
  assert.strictEqual(aggregate(rs, 'p90 v').value, 9);
  assert.strictEqual(aggregate([], 'p99 v').value, null);
});

test('histogram fills gaps', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const r = aggregate([{ '@t': t }, { '@t': t + 180000 }, { x: 1 }, { '@t': t + 5 }], 'histogram 1m');
  assert.strictEqual(r.interval, '1m');
  assert.deepStrictEqual(r.buckets, [
    { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }]);
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 1h').buckets, []);
});

test('invalid specs', () => {
  for (const s of ['', 'top 0 a', 'top a', 'top 1', 'histogram 0m', 'histogram 5w', 'histogram m', 'sum', 'p42 a',
    'COUNT', 'bogus', 'count by', 'top 1.5 a', 'avg a b']) {
    assert.throws(() => aggregate(R, s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});
