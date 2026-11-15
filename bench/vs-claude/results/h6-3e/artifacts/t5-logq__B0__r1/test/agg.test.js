'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

const recs = [
  { s: 500, n: '10', u: 'a' }, { s: 200, n: 20, u: 'b' }, { s: 500, n: 'x', u: 'a' },
  { s: '500', u: null }, { s: 404 },
];

test('count', () => assert.deepStrictEqual(aggregate(recs, '  count '), { type: 'count', value: 5 }));

test('count by: bỏ thiếu/null, giữ kiểu, sắp xếp', () => {
  assert.deepStrictEqual(aggregate(recs, 'count by s'), { type: 'count_by', field: 's', buckets: [
    { key: 500, count: 2 }, { key: '500', count: 1 }, { key: 200, count: 1 }, { key: 404, count: 1 },
  ].sort((a, b) => b.count - a.count || (String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0)) });
  assert.deepStrictEqual(aggregate(recs, 'count by u').buckets, [{ key: 'a', count: 2 }, { key: 'b', count: 1 }]);
});

test('top n', () => {
  assert.deepStrictEqual(aggregate(recs, 'top 1 u'), { type: 'top', field: 'u', buckets: [{ key: 'a', count: 2 }] });
  for (const bad of ['top 0 u', 'top -1 u', 'top 1.5 u', 'top x u', 'top 2', 'top']) {
    assert.throws(() => aggregate(recs, bad), /^Error: invalid aggregation/);
  }
});

test('sum/avg/min/max', () => {
  assert.strictEqual(aggregate(recs, 'sum n').value, 30);
  assert.strictEqual(aggregate(recs, 'min n').value, 10);
  assert.strictEqual(aggregate(recs, 'max n').value, 20);
  assert.strictEqual(aggregate([{ a: 1 }, { a: 1 }, { a: 2 }], 'avg a').value, 1.3333);
  assert.deepStrictEqual(aggregate(recs, 'sum zz'), { type: 'sum', field: 'zz', value: null });
  assert.strictEqual(aggregate([], 'avg a').value, null);
});

test('percentile nearest-rank', () => {
  const r = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepStrictEqual(aggregate(r, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.strictEqual(aggregate(r, 'p90 v').value, 9);
  assert.strictEqual(aggregate(r, 'p95 v').value, 10);
  assert.strictEqual(aggregate(r, 'p99 v').value, 10);
  assert.strictEqual(aggregate([], 'p99 v').value, null);
});

test('histogram', () => {
  const t = Date.parse('2024-01-01T10:00:30Z');
  const r = [{ '@t': t }, { '@t': t + 1000 }, { '@t': t + 180000 }, {}];
  const h = aggregate(r, 'histogram 1m');
  assert.strictEqual(h.interval, '1m');
  assert.deepStrictEqual(h.buckets, [
    { key: '2024-01-01T10:00:00.000Z', count: 2 },
    { key: '2024-01-01T10:01:00.000Z', count: 0 },
    { key: '2024-01-01T10:02:00.000Z', count: 0 },
    { key: '2024-01-01T10:03:00.000Z', count: 1 },
  ]);
  assert.deepStrictEqual(aggregate([{}], 'histogram 1d'), { type: 'histogram', interval: '1d', buckets: [] });
  for (const u of ['s', 'h', 'd']) assert.strictEqual(aggregate([], ' histogram 2' + u).interval, '2' + u);
  for (const bad of ['histogram 0m', 'histogram m', 'histogram 1x', 'histogram 1.5m', 'histogram']) {
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/);
  }
});

test('spec sai', () => {
  for (const bad of ['', 'foo', 'COUNT', 'count by', 'count x', 'sum', 'p75 a', 'avg a b']) {
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/);
  }
});
