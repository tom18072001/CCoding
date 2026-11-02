'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg');

const R = [
  { lvl: 'a', n: 1, s: '10' }, { lvl: 'b', n: 2 }, { lvl: 'a', n: 3 },
  { lvl: null, n: 'x' }, { n: 4 }, { lvl: 1 }, { lvl: '1' },
];

test('count', () => {
  assert.deepStrictEqual(aggregate(R, ' count '), { type: 'count', value: 7 });
  assert.deepStrictEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by / top', () => {
  const r = aggregate(R, 'count  by lvl');
  assert.deepStrictEqual(r.buckets, [
    { key: 'a', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'b', count: 1 },
  ]);
  assert.strictEqual(aggregate(R, 'top 2 lvl').type, 'top');
  assert.strictEqual(aggregate(R, 'top 2 lvl').buckets.length, 2);
  for (const s of ['top 0 lvl', 'top 1.5 lvl', 'top x lvl', 'top 2', 'TOP 2 lvl']) {
    assert.throws(() => aggregate(R, s), /^Error: invalid aggregation/);
  }
});

test('sum avg min max', () => {
  assert.strictEqual(aggregate(R, 'sum n').value, 10);
  assert.strictEqual(aggregate(R, 'min n').value, 1);
  assert.strictEqual(aggregate(R, 'max n').value, 4);
  assert.strictEqual(aggregate([{ a: 1 }, { a: 1 }, { a: 2 }], 'avg a').value, 1.3333);
  assert.strictEqual(aggregate(R, 'sum s').value, 10);
  assert.strictEqual(aggregate(R, 'sum zz').value, null);
  assert.strictEqual(aggregate([{ a: 'x' }], 'avg a').value, null);
});

test('percentiles nearest-rank', () => {
  const recs = [];
  for (let i = 10; i >= 1; i--) recs.push({ v: i });
  assert.strictEqual(aggregate(recs, 'p50 v').value, 5);
  assert.strictEqual(aggregate(recs, 'p90 v').value, 9);
  assert.strictEqual(aggregate(recs, 'p95 v').value, 10);
  assert.strictEqual(aggregate(recs, 'p99 v').type, 'p99');
  assert.strictEqual(aggregate([], 'p50 v').value, null);
});

test('histogram', () => {
  const recs = [{ '@t': 0 }, { '@t': 500 }, { '@t': 3000 }, { x: 1 }];
  assert.deepStrictEqual(aggregate(recs, 'histogram 1s'), {
    type: 'histogram',
    interval: '1s',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 2 },
      { key: '1970-01-01T00:00:01.000Z', count: 0 },
      { key: '1970-01-01T00:00:02.000Z', count: 0 },
      { key: '1970-01-01T00:00:03.000Z', count: 1 },
    ],
  });
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 1h').buckets, []);
  for (const s of ['histogram 0s', 'histogram 1w', 'histogram s', 'histogram']) {
    assert.throws(() => aggregate(recs, s), /^Error: invalid aggregation/);
  }
});

test('invalid specs', () => {
  for (const s of ['', 'foo', 'count by', 'sum', 'p42 x']) {
    assert.throws(() => aggregate(R, s), /^Error: invalid aggregation/);
  }
});
