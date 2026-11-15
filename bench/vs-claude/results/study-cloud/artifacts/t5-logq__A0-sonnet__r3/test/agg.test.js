'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count, count by, top', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  const r = [{ k: 2 }, { k: 10 }, { k: '10' }, { k: null }, {}, { k: 2 }];
  assert.deepEqual(aggregate(r, 'count by k').buckets, [{ key: 2, count: 2 }, { key: 10, count: 1 }, { key: '10', count: 1 }]);
  assert.deepEqual(aggregate(r, 'top 1 k'), { type: 'top', field: 'k', buckets: [{ key: 2, count: 2 }] });
});
test('số học và percentile', () => {
  const r = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: 4 }, {}];
  assert.equal(aggregate(r, 'sum v').value, 7);
  assert.equal(aggregate(r, 'avg v').value, 2.3333);
  assert.equal(aggregate(r, 'min v').value, 1);
  assert.equal(aggregate(r, 'max v').value, 4);
  assert.equal(aggregate([], 'max v').value, null);
  const p = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v }));
  assert.equal(aggregate(p, 'p50 v').value, 5);
  assert.equal(aggregate(p, 'p95 v').value, 10);
  assert.equal(aggregate([], 'p99 v').value, null);
  assert.equal(aggregate(p, 'p90 v').type, 'p90');
});
test('histogram điền mốc trống', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const r = [{ '@t': t }, { '@t': t + 150000 }, { x: 1 }];
  assert.deepEqual(aggregate(r, 'histogram 1m'), { type: 'histogram', interval: '1m', buckets: [
    { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 }, { key: '2024-01-01T00:02:00.000Z', count: 1 } ] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});
test('spec sai', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'COUNT', 'histogram 0s', 'histogram 5x', 'histogram m', 'sum', 'count x y', 'p75 f'])
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
});
