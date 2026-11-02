'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/agg');

const bad = (s) => assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), String(s));

test('count', () => {
  assert.deepEqual(aggregate([{}, {}], '  count '), { type: 'count', value: 2 });
  assert.deepEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by: kiểu giữ nguyên, bỏ thiếu/null, sắp xếp', () => {
  const recs = [{ a: 1 }, { a: '1' }, { a: 1 }, { a: null }, {}, { a: 'b' }, { a: 'a' }, { a: 'B' }];
  assert.deepEqual(aggregate(recs, 'count  by a'), {
    type: 'count_by', field: 'a',
    buckets: [{ key: 1, count: 2 }, { key: '1', count: 1 }, { key: 'B', count: 1 }, { key: 'a', count: 1 }, { key: 'b', count: 1 }],
  });
  assert.deepEqual(aggregate([], 'count by a').buckets, []);
});

test('top', () => {
  const recs = [{ a: 'x' }, { a: 'y' }, { a: 'y' }, { a: 'z' }];
  assert.deepEqual(aggregate(recs, 'top 2 a'), { type: 'top', field: 'a', buckets: [{ key: 'y', count: 2 }, { key: 'x', count: 1 }] });
  assert.equal(aggregate(recs, 'top 10 a').buckets.length, 3);
  for (const s of ['top 0 a', 'top -1 a', 'top 1.5 a', 'top x a', 'top 2', 'top 2 a b']) bad(s);
});

test('sum/avg/min/max', () => {
  const recs = [{ v: 1 }, { v: '2.5' }, { v: 'abc' }, { v: null }, {}, { v: true }, { v: 4 }];
  assert.deepEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 7.5 });
  assert.deepEqual(aggregate(recs, 'min v'), { type: 'min', field: 'v', value: 1 });
  assert.deepEqual(aggregate(recs, 'max v'), { type: 'max', field: 'v', value: 4 });
  assert.equal(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  for (const t of ['sum', 'avg', 'min', 'max']) assert.deepEqual(aggregate([{}], t + ' v'), { type: t, field: 'v', value: null });
  bad('sum'); bad('sum a b');
});

test('percentile nearest-rank', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ v: String(10 - i) }));
  assert.deepEqual(aggregate(recs, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.equal(aggregate(recs, 'p90 v').value, 9);
  assert.equal(aggregate(recs, 'p95 v').value, 10);
  assert.equal(aggregate(recs, 'p99 v').type, 'p99');
  assert.equal(aggregate([], 'p95 v').value, null);
  bad('p75 v'); bad('p95');
});

test('histogram', () => {
  const recs = [{ '@t': 0 }, { '@t': 59999 }, { '@t': 180000 }, { x: 1 }];
  assert.deepEqual(aggregate(recs, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 2 },
      { key: '1970-01-01T00:01:00.000Z', count: 0 },
      { key: '1970-01-01T00:02:00.000Z', count: 0 },
      { key: '1970-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
  assert.equal(aggregate([{ '@t': 86400000 * 3 }], 'histogram 2d').buckets[0].key, '1970-01-03T00:00:00.000Z');
});

test('spec không hợp lệ', () => {
  for (const s of ['', '   ', 'foo', 'COUNT', 'count x', 'count by', 'histogram', 'histogram 0m', 'histogram 5x', 'histogram m', 'histogram 1.5m', 'histogram 1m 2m', 42, undefined]) bad(s);
});
