'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
});

test('count by / top ordering', () => {
  const recs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: 1 }, { s: null }, {}, { s: 10 }, { s: 2 }];
  assert.deepEqual(aggregate(recs, 'count by s').buckets, [
    { key: 'b', count: 2 }, { key: 1, count: 1 }, { key: 10, count: 1 }, { key: 2, count: 1 }, { key: 'a', count: 1 },
  ]);
  const t = aggregate(recs, 'top 2   s');
  assert.equal(t.type, 'top');
  assert.equal(t.field, 's');
  assert.deepEqual(t.buckets, [{ key: 'b', count: 2 }, { key: 1, count: 1 }]);
});

test('numeric aggregates', () => {
  const recs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, {}, { v: 4 }];
  assert.deepEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.deepEqual(aggregate(recs, 'avg v'), { type: 'avg', field: 'v', value: 2.3333 });
  assert.equal(aggregate(recs, 'min v').value, 1);
  assert.equal(aggregate(recs, 'max v').value, 4);
  for (const k of ['sum', 'avg', 'min', 'max', 'p50']) assert.equal(aggregate([{ v: 'x' }], k + ' v').value, null);
});

test('percentiles nearest-rank', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.equal(aggregate(recs, 'p50 v').value, 5);
  assert.equal(aggregate(recs, 'p90 v').value, 9);
  assert.equal(aggregate(recs, 'p99 v').value, 10);
  assert.deepEqual(aggregate(recs, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
});

test('histogram', () => {
  const t = (s) => Date.parse(s);
  const recs = [{ '@t': t('2024-01-01T00:00:10Z') }, { '@t': t('2024-01-01T00:03:30Z') }, { '@t': t('2024-01-01T00:00:50Z') }, {}];
  assert.deepEqual(aggregate(recs, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
  assert.equal(aggregate(recs, 'histogram 1d').buckets.length, 1);
});

test('invalid specs', () => {
  for (const s of ['', 'foo', 'COUNT', 'count by', 'count x', 'top s', 'top 0 s', 'top 1.5 s', 'top -1 s', 'sum', 'sum a b',
    'histogram', 'histogram 0m', 'histogram 5', 'histogram 5w', 'histogram m', 'p42 x', 'count by a b', 'sum 1x']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});
