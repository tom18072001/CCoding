'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/agg');

const bad = (s) => assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), String(s));

test('count', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  assert.deepEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by: thứ tự, kiểu, bỏ thiếu/null', () => {
  const recs = [{ s: 2 }, { s: 10 }, { s: 10 }, { s: 'b' }, { s: 'a' }, {}, { s: null }, { s: 2 }];
  assert.deepEqual(aggregate(recs, 'count   by s'), {
    type: 'count_by', field: 's',
    buckets: [{ key: 10, count: 2 }, { key: 2, count: 2 }, { key: 'a', count: 1 }, { key: 'b', count: 1 }],
  });
});

test('top', () => {
  const recs = [{ s: 'a' }, { s: 'b' }, { s: 'b' }, { s: 'c' }];
  assert.deepEqual(aggregate(recs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }, { key: 'a', count: 1 }] });
  assert.equal(aggregate(recs, 'top 99 s').buckets.length, 3);
});

test('sum/avg/min/max', () => {
  const recs = [{ x: 1 }, { x: '2.5' }, { x: 'abc' }, { x: true }, {}, { x: null }, { x: 1 }];
  assert.deepEqual(aggregate(recs, 'sum x'), { type: 'sum', field: 'x', value: 4.5 });
  assert.deepEqual(aggregate(recs, 'avg x'), { type: 'avg', field: 'x', value: 1.5 });
  assert.equal(aggregate(recs, 'min x').value, 1);
  assert.equal(aggregate(recs, 'max x').value, 2.5);
  assert.equal(aggregate([{ x: 1 }, { x: 1 }, { x: 2 }], 'avg x').value, 1.3333);
  for (const t of ['sum', 'avg', 'min', 'max']) assert.deepEqual(aggregate([{ y: 1 }], t + ' x'), { type: t, field: 'x', value: null });
});

test('percentile nearest-rank', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ x: 10 - i }));
  assert.equal(aggregate(recs, 'p50 x').value, 5);
  assert.equal(aggregate(recs, 'p90 x').value, 9);
  assert.equal(aggregate(recs, 'p95 x').value, 10);
  assert.deepEqual(aggregate(recs, 'p99 x'), { type: 'p99', field: 'x', value: 10 });
  assert.equal(aggregate([], 'p50 x').value, null);
  assert.equal(aggregate([{ x: 7 }], 'p50 x').value, 7);
});

test('histogram', () => {
  const t = Date.parse('2024-01-01T00:00:00Z');
  const recs = [{ '@t': t + 1000 }, { '@t': t + 5 * 60000 * 3 }, { '@t': t + 2000 }, { x: 1 }];
  assert.deepEqual(aggregate(recs, 'histogram 5m'), {
    type: 'histogram', interval: '5m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:05:00.000Z', count: 0 },
      { key: '2024-01-01T00:10:00.000Z', count: 0 },
      { key: '2024-01-01T00:15:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{ a: 1 }], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
  assert.equal(aggregate([{ '@t': 0 }], 'histogram 1d').buckets[0].key, '1970-01-01T00:00:00.000Z');
  assert.equal(aggregate([{ '@t': 1500 }], 'histogram 1s').buckets[0].key, '1970-01-01T00:00:01.000Z');
});

test('spec không hợp lệ', () => {
  for (const s of ['', '  ', 'COUNT', 'count by', 'count by a b', 'count x', 'top s', 'top 0 s', 'top 1.5 s', 'top -1 s', 'top 2',
    'sum', 'sum a b', 'p50', 'p75 x', 'histogram', 'histogram 5', 'histogram 0m', 'histogram m', 'histogram 5w', 'histogram 5m x', 'foo', undefined, 5]) bad(s);
});
