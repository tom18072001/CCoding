'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/agg');

const bad = (s) => assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'));

test('count và count by', () => {
  assert.deepEqual(aggregate([{}, {}], '  count '), { type: 'count', value: 2 });
  const r = aggregate([{ a: 2 }, { a: 'x' }, { a: 2 }, { b: 1 }, { a: null }, { a: 'b' }], 'count  by a');
  assert.deepEqual(r.buckets, [{ key: 2, count: 2 }, { key: 'b', count: 1 }, { key: 'x', count: 1 }]);
});

test('top', () => {
  const r = aggregate([{ a: 1 }, { a: 2 }, { a: 2 }, { a: 3 }], 'top 2 a');
  assert.equal(r.type, 'top');
  assert.deepEqual(r.buckets, [{ key: 2, count: 2 }, { key: 1, count: 1 }]);
});

test('sum/avg/min/max', () => {
  const rs = [{ v: 1 }, { v: '2.5' }, { v: 'abc' }, {}, { v: 2 }];
  assert.equal(aggregate(rs, 'sum v').value, 5.5);
  assert.equal(aggregate(rs, 'avg v').value, 1.8333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 2.5);
  assert.deepEqual(aggregate([], 'sum v'), { type: 'sum', field: 'v', value: null });
});

test('percentile nearest-rank', () => {
  const rs = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.equal(aggregate(rs, 'p50 v').value, 5);
  assert.equal(aggregate(rs, 'p95 v').value, 10);
  assert.equal(aggregate([], 'p99 v').value, null);
});

test('histogram', () => {
  const t = Date.UTC(2024, 0, 1, 0, 0, 0);
  const r = aggregate([{ '@t': t + 5000 }, { '@t': t + 125000 }, { x: 1 }], 'histogram 1m');
  assert.equal(r.interval, '1m');
  assert.deepEqual(r.buckets, [
    { key: '2024-01-01T00:00:00.000Z', count: 1 },
    { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 1 },
  ]);
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('spec không hợp lệ', () => {
  for (const s of ['', '  ', 'foo', 'count by', 'top 0 a', 'top 1.5 a', 'top a', 'top 2', 'sum', 'p50', 'histogram 0s', 'histogram 1w', 'histogram s', 'histogram', 'COUNT']) bad(s);
});
