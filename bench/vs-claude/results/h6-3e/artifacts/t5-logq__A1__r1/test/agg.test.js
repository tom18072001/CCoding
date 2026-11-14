'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, parseLine } = require('../src');

test('count', () => {
  assert.deepEqual(aggregate([{}, {}], 'count'), { type: 'count', value: 2 });
  assert.deepEqual(aggregate([], '  count  '), { type: 'count', value: 0 });
});

test('count by: ordering, types, missing', () => {
  const recs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, {}, { s: null }, { s: 2 }, { s: 10 }, { s: 2 }, { s: 'a' }];
  assert.deepEqual(aggregate(recs, 'count  by  s'), {
    type: 'count_by',
    field: 's',
    buckets: [
      { key: 2, count: 2 },
      { key: 'a', count: 2 },
      { key: 'b', count: 2 },
      { key: 10, count: 1 },
    ],
  });
});

test('count by: tie order is string comparison', () => {
  const r = aggregate([{ k: 'b' }, { k: 'B' }, { k: 10 }, { k: 9 }], 'count by k');
  assert.deepEqual(r.buckets.map((b) => b.key), [10, 9, 'B', 'b']);
});

test('top', () => {
  const recs = [{ s: 'a' }, { s: 'b' }, { s: 'b' }, { s: 'c' }];
  assert.deepEqual(aggregate(recs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }, { key: 'a', count: 1 }] });
  assert.equal(aggregate(recs, 'top 99 s').buckets.length, 3);
});

test('sum avg min max', () => {
  const recs = [{ v: 1 }, { v: '2.5' }, { v: 'x' }, { v: true }, {}, { v: null }, { v: 3 }];
  assert.deepEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 6.5 });
  assert.deepEqual(aggregate(recs, 'min v'), { type: 'min', field: 'v', value: 1 });
  assert.deepEqual(aggregate(recs, 'max v'), { type: 'max', field: 'v', value: 3 });
  assert.deepEqual(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v'), { type: 'avg', field: 'v', value: 1.3333 });
  for (const t of ['sum', 'avg', 'min', 'max']) assert.deepEqual(aggregate([{ v: 'x' }], t + ' v'), { type: t, field: 'v', value: null });
});

test('percentiles nearest-rank', () => {
  const recs = [];
  for (let i = 10; i >= 1; i--) recs.push({ v: i });
  assert.equal(aggregate(recs, 'p50 v').value, 5);
  assert.equal(aggregate(recs, 'p90 v').value, 9);
  assert.equal(aggregate(recs, 'p95 v').value, 10);
  assert.equal(aggregate(recs, 'p99 v').value, 10);
  assert.deepEqual(aggregate(recs, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate([{ v: 7 }], 'p50 v').value, 7);
  assert.equal(aggregate([], 'p50 v').value, null);
  assert.equal(aggregate([{ v: '3' }, { v: 1 }], 'p50 v').value, 1);
});

test('histogram', () => {
  const t = (s) => parseLine('ts=' + s).record;
  const recs = [t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:20Z'), t('2024-01-01T00:00:59Z'), { x: 1 }];
  assert.deepEqual(aggregate(recs, 'histogram 1m'), {
    type: 'histogram',
    interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 },
      { key: '2024-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([], 'histogram 5m'), { type: 'histogram', interval: '5m', buckets: [] });
  assert.deepEqual(aggregate([{ a: 1 }], 'histogram 1h').buckets, []);
  const d = aggregate([t('2024-01-01T23:00:00Z'), t('2024-01-03T01:00:00Z')], 'histogram 1d');
  assert.deepEqual(d.buckets.map((b) => b.count), [1, 0, 1]);
  const s = aggregate([t('2024-01-01T00:00:00Z'), t('2024-01-01T00:00:03Z')], 'histogram 2s');
  assert.deepEqual(s.buckets.map((b) => b.key), ['2024-01-01T00:00:00.000Z', '2024-01-01T00:00:02.000Z']);
  assert.equal(aggregate([t('2024-01-01T05:00:00Z')], 'histogram 2h').buckets[0].key, '2024-01-01T04:00:00.000Z');
});

test('invalid specs', () => {
  const specs = ['', ' ', 'foo', 'count by', 'count x', 'COUNT', 'top s', 'top 0 s', 'top -1 s', 'top 1.5 s', 'top x s', 'top 2',
    'sum', 'sum a b', 'p50', 'p75 v', 'histogram', 'histogram 0m', 'histogram 5x', 'histogram m', 'histogram 1.5m', 'histogram -1m', 'count by a b', 'avg'];
  for (const s of specs) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), 'spec: ' + JSON.stringify(s));
  }
  assert.throws(() => aggregate([], undefined), /^Error: invalid aggregation/);
});
