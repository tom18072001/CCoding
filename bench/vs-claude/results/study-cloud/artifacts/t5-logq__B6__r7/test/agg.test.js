'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg.js');

test('count', () => {
  assert.deepStrictEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  assert.deepStrictEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by: tie-break, null/missing bỏ, key số', () => {
  const recs = [{ a: 'b' }, { a: 'a' }, { a: 'B' }, { a: null }, {}, { a: 'b' }, { a: 10 }, { a: 9 }, { a: '9' }];
  const r = aggregate(recs, 'count   by a');
  assert.strictEqual(r.type, 'count_by');
  assert.deepStrictEqual(r.buckets, [
    { key: 'b', count: 2 },
    { key: 10, count: 1 },
    { key: 9, count: 1 },
    { key: '9', count: 1 },
    { key: 'B', count: 1 },
    { key: 'a', count: 1 },
  ]);
  assert.strictEqual(typeof aggregate([{ s: 500 }], 'count by s').buckets[0].key, 'number');
});

test('top', () => {
  const recs = [{ a: 'x' }, { a: 'x' }, { a: 'y' }, { a: 'z' }];
  const r = aggregate(recs, 'top 2 a');
  assert.strictEqual(r.type, 'top');
  assert.deepStrictEqual(r.buckets, [{ key: 'x', count: 2 }, { key: 'y', count: 1 }]);
});

test('sum/avg/min/max với chuỗi số', () => {
  const recs = [{ v: 1 }, { v: '2.5' }, { v: 'abc' }, { v: true }, { v: null }, {}];
  assert.deepStrictEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 3.5 });
  assert.strictEqual(aggregate(recs, 'min v').value, 1);
  assert.strictEqual(aggregate(recs, 'max v').value, 2.5);
  assert.strictEqual(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  assert.strictEqual(aggregate([{ v: 'x' }], 'sum v').value, null);
  assert.strictEqual(aggregate([], 'avg v').value, null);
});

test('percentile nearest-rank', () => {
  const recs = [];
  for (let i = 10; i >= 1; i--) recs.push({ v: i });
  assert.deepStrictEqual(aggregate(recs, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.strictEqual(aggregate(recs, 'p90 v').value, 9);
  assert.strictEqual(aggregate(recs, 'p95 v').value, 10);
  assert.strictEqual(aggregate(recs, 'p99 v').type, 'p99');
  assert.strictEqual(aggregate([], 'p95 v').value, null);
});

test('histogram có mốc trống', () => {
  const recs = [{ '@t': 0 }, { '@t': 59999 }, { '@t': 180000 }, { msg: 'no t' }];
  const r = aggregate(recs, 'histogram 1m');
  assert.strictEqual(r.type, 'histogram');
  assert.strictEqual(r.interval, '1m');
  assert.deepStrictEqual(r.buckets, [
    { key: '1970-01-01T00:00:00.000Z', count: 2 },
    { key: '1970-01-01T00:01:00.000Z', count: 0 },
    { key: '1970-01-01T00:02:00.000Z', count: 0 },
    { key: '1970-01-01T00:03:00.000Z', count: 1 },
  ]);
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 5s').buckets, []);
});

test('spec sai', () => {
  const bad = ['', '   ', 'foo', 'count by', 'count x', 'count by a b', 'top a', 'top 0 a', 'top 1.5 a', 'top -1 a', 'top 1',
    'sum', 'sum a b', 'p50', 'p75 a', 'histogram', 'histogram 0s', 'histogram 5x', 'histogram s', 'histogram 1.5s', 'COUNT'];
  for (const s of bad) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});
