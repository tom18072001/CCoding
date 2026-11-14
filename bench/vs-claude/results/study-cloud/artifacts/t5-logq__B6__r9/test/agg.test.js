'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg.js');

const R = [
  { a: 'x', n: 10, s: '2.5' },
  { a: 'y', n: 20, s: 'abc' },
  { a: 'x', n: '30' },
  { a: 10, n: true },
  { a: null },
];

test('count', () => {
  assert.deepStrictEqual(aggregate(R, '  count '), { type: 'count', value: 5 });
});

test('count by: giữ kiểu, bỏ null, sắp hòa theo String(key)', () => {
  const r = aggregate([{ a: 'b' }, { a: 10 }, { a: 9 }, { a: 'b' }, {}, { a: null }], 'count  by a');
  assert.deepStrictEqual(r, { type: 'count_by', field: 'a', buckets: [
    { key: 'b', count: 2 }, { key: 10, count: 1 }, { key: 9, count: 1 }] });
});

test('top', () => {
  const r = aggregate(R, 'top 1 a');
  assert.strictEqual(r.type, 'top');
  assert.deepStrictEqual(r.buckets, [{ key: 'x', count: 2 }]);
});

test('sum/avg/min/max', () => {
  assert.strictEqual(aggregate(R, 'sum n').value, 60);
  assert.strictEqual(aggregate(R, 'min n').value, 10);
  assert.strictEqual(aggregate(R, 'max n').value, 30);
  assert.strictEqual(aggregate([{ n: 1 }, { n: 1 }, { n: 2 }], 'avg n').value, 1.3333);
  assert.strictEqual(aggregate(R, 'sum zz').value, null);
  assert.deepStrictEqual(aggregate(R, 'sum s'), { type: 'sum', field: 's', value: 2.5 });
});

test('percentile nearest-rank', () => {
  const recs = [];
  for (let i = 1; i <= 10; i++) recs.push({ v: i });
  assert.deepStrictEqual(aggregate(recs, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.strictEqual(aggregate(recs, 'p50 v').value, 5);
  assert.strictEqual(aggregate(recs, 'p90 v').value, 9);
  assert.strictEqual(aggregate([], 'p99 v').value, null);
});

test('histogram điền mốc trống', () => {
  const t0 = Date.UTC(2024, 0, 1, 0, 0, 5);
  const r = aggregate([{ '@t': t0 }, { '@t': t0 + 180000 }, { x: 1 }], 'histogram 1m');
  assert.strictEqual(r.interval, '1m');
  assert.deepStrictEqual(r.buckets.map(b => b.count), [1, 0, 0, 1]);
  assert.strictEqual(r.buckets[0].key, '2024-01-01T00:00:00.000Z');
  assert.deepStrictEqual(aggregate([{ x: 1 }], 'histogram 1h').buckets, []);
});

test('spec sai', () => {
  for (const s of ['', 'count by', 'count x', 'top 0 a', 'top -1 a', 'top 1.5 a', 'top a', 'top 2',
    'sum', 'sum a b', 'p50', 'p75 a', 'histogram 5x', 'histogram 0m', 'histogram', 'histogram m', 'foo', 'COUNT']) {
    assert.throws(() => aggregate(R, s), /^Error: invalid aggregation/, s);
  }
});
