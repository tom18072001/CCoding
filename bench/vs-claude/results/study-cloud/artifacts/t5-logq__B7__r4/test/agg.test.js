'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/agg');

test('count', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
});

test('count by: sắp xếp, kiểu key, bỏ null', () => {
  const recs = [{ s: 10 }, { s: 9 }, { s: 9 }, { s: null }, {}, { s: 'b' }, { s: 'a' }, { s: 10 }];
  assert.deepEqual(aggregate(recs, 'count  by s').buckets, [
    { key: 10, count: 2 }, { key: 9, count: 2 }, { key: 'a', count: 1 }, { key: 'b', count: 1 },
  ]);
  // hòa: so sánh chuỗi → "10" < "9"
});

test('top', () => {
  const recs = [{ s: 'a' }, { s: 'a' }, { s: 'b' }, { s: 'c' }];
  assert.deepEqual(aggregate(recs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'a', count: 2 }, { key: 'b', count: 1 }] });
});

test('sum/avg/min/max', () => {
  const recs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, {}, { v: 4 }];
  assert.deepEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(recs, 'avg v').value, 2.3333);
  assert.equal(aggregate(recs, 'min v').value, 1);
  assert.equal(aggregate(recs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  assert.equal(aggregate([{ v: 'x' }], 'max v').value, null);
});

test('percentile nearest-rank', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.deepEqual(aggregate(recs, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.equal(aggregate(recs, 'p90 v').value, 9);
  assert.equal(aggregate(recs, 'p95 v').value, 10);
  assert.equal(aggregate(recs, 'p99 v').value, 10);
  assert.equal(aggregate([], 'p99 v').value, null);
});

test('histogram: điền mốc trống', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const recs = [{ '@t': t }, { '@t': t + 1000 }, { '@t': t + 125000 }, {}];
  assert.deepEqual(aggregate(recs, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 5s').buckets, []);
});

test('spec không hợp lệ', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'sum', 'p75 f', 'histogram 0m', 'histogram 5x', 'histogram m', 'COUNT', 'count x']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});

test('histogram: giới hạn an toàn cho vòng điền mốc', () => {
  const recs = [{ '@t': 0 }, { '@t': 4e12 }];
  assert.throws(() => aggregate(recs, 'histogram 1s'), (e) => e.message.startsWith('invalid aggregation'));
  assert.equal(aggregate(recs, 'histogram 1d').buckets.length, 46297);
});
