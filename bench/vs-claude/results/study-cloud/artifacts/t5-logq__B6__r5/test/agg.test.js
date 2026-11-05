'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg.js'));

const recs = [
  { lvl: 'a', n: 10, s: '5' },
  { lvl: 'b', n: 20 },
  { lvl: 'a', n: 'x' },
  { lvl: null, n: true },
  { lvl: 1 },
  { lvl: '1' },
  { lvl: 1 },
];

test('count', () => {
  assert.deepStrictEqual(aggregate(recs, '  count '), { type: 'count', value: 7 });
});

test('count by: kiểu key, thứ tự, bỏ null/thiếu', () => {
  const r = aggregate(recs, 'count by lvl');
  assert.deepStrictEqual(r, {
    type: 'count_by', field: 'lvl',
    buckets: [{ key: 1, count: 2 }, { key: 'a', count: 2 }, { key: '1', count: 1 }, { key: 'b', count: 1 }],
  });
});

test('top', () => {
  const r = aggregate(recs, 'top 2 lvl');
  assert.strictEqual(r.type, 'top');
  assert.strictEqual(r.buckets.length, 2);
  assert.throws(() => aggregate(recs, 'top 0 lvl'), /^Error: invalid aggregation/);
  assert.throws(() => aggregate(recs, 'top 1.5 lvl'), /^Error: invalid aggregation/);
});

test('sum/avg/min/max', () => {
  assert.strictEqual(aggregate(recs, 'sum n').value, 30);
  assert.strictEqual(aggregate(recs, 'sum s').value, 5);
  assert.strictEqual(aggregate(recs, 'avg n').value, 15);
  assert.strictEqual(aggregate([{ n: 1 }, { n: 1 }, { n: 2 }], 'avg n').value, 1.3333);
  assert.strictEqual(aggregate(recs, 'min n').value, 10);
  assert.strictEqual(aggregate(recs, 'max n').value, 20);
  assert.deepStrictEqual(aggregate(recs, 'max zz'), { type: 'max', field: 'zz', value: null });
});

test('percentile nearest-rank', () => {
  const r = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.strictEqual(aggregate(r, 'p50 v').value, 5);
  assert.strictEqual(aggregate(r, 'p90 v').value, 9);
  assert.strictEqual(aggregate(r, 'p99 v').value, 10);
  assert.deepStrictEqual(aggregate([], 'p95 v'), { type: 'p95', field: 'v', value: null });
});

test('histogram điền mốc trống', () => {
  const r = [{ '@t': 0 }, { '@t': 500 }, { '@t': 3000 }, { x: 1 }];
  assert.deepStrictEqual(aggregate(r, 'histogram 1s'), {
    type: 'histogram', interval: '1s',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 2 },
      { key: '1970-01-01T00:00:01.000Z', count: 0 },
      { key: '1970-01-01T00:00:02.000Z', count: 0 },
      { key: '1970-01-01T00:00:03.000Z', count: 1 },
    ],
  });
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 5m'), { type: 'histogram', interval: '5m', buckets: [] });
});

test('spec không hợp lệ', () => {
  const bad = ['', '   ', 'foo', 'count by', 'sum', 'p50', 'p75 x', 'histogram 0s', 'histogram 1x',
    'histogram s', 'histogram 1.5s', 'COUNT', 'count x', 'top x lvl', 'avg a b', 5];
  for (const s of bad) {
    assert.throws(() => aggregate(recs, s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), String(s));
  }
});
