'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg');

test('count', () => {
  assert.deepStrictEqual(aggregate([{}, {}], '  count '), { type: 'count', value: 2 });
  assert.deepStrictEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by: kiểu key, thứ tự, bỏ null/thiếu', () => {
  const r = [{ a: 2 }, { a: 'x' }, { a: 10 }, { a: null }, {}, { a: 2 }, { a: 'x' }];
  assert.deepStrictEqual(aggregate(r, 'count by a').buckets, [
    { key: 2, count: 2 },
    { key: 'x', count: 2 },
    { key: 10, count: 1 },
  ]);
});

test('top n', () => {
  const r = [{ a: 'b' }, { a: 'a' }, { a: 'a' }, { a: 'c' }];
  const res = aggregate(r, 'top 2 a');
  assert.strictEqual(res.type, 'top');
  assert.deepStrictEqual(res.buckets, [{ key: 'a', count: 2 }, { key: 'b', count: 1 }]);
});

test('sum/avg/min/max', () => {
  const r = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, {}, { v: 4 }];
  assert.strictEqual(aggregate(r, 'sum v').value, 7);
  assert.strictEqual(aggregate(r, 'avg v').value, 2.3333);
  assert.strictEqual(aggregate(r, 'min v').value, 1);
  assert.strictEqual(aggregate(r, 'max v').value, 4);
  assert.deepStrictEqual(aggregate([{ v: 'x' }], 'avg v'), { type: 'avg', field: 'v', value: null });
});

test('percentile nearest-rank', () => {
  const r = [];
  for (let i = 1; i <= 10; i++) r.push({ v: i });
  assert.strictEqual(aggregate(r, 'p50 v').value, 5);
  assert.strictEqual(aggregate(r, 'p90 v').value, 9);
  assert.strictEqual(aggregate(r, 'p99 v').value, 10);
  assert.deepStrictEqual(aggregate([], 'p95 v'), { type: 'p95', field: 'v', value: null });
});

test('histogram điền mốc trống', () => {
  const r = [{ '@t': 0 }, { '@t': 59999 }, { '@t': 180000 }, { x: 1 }];
  assert.deepStrictEqual(aggregate(r, 'histogram 1m'), {
    type: 'histogram',
    interval: '1m',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 2 },
      { key: '1970-01-01T00:01:00.000Z', count: 0 },
      { key: '1970-01-01T00:02:00.000Z', count: 0 },
      { key: '1970-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepStrictEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('spec sai', () => {
  const bad = ['', 'foo', 'count by', 'count x', 'top 0 a', 'top 1.5 a', 'top a', 'sum', 'sum a b',
    'histogram 0s', 'histogram 5w', 'histogram s', 'p75 a', 'count by a b', 'top 2 a b', null, 5];
  for (const s of bad) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), String(s));
  }
});
