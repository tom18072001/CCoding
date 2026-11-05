'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count, by, top', () => {
  const rs = [{ s: 2 }, { s: 10 }, { s: 2 }, { s: null }, {}, { s: 10 }, { s: 'a' }];
  assert.deepEqual(aggregate(rs, 'count'), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, ' count  by s ').buckets, [{ key: 10, count: 2 }, { key: 2, count: 2 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 10, count: 2 }] });
});
test('số học và percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: 4 }, {}];
  assert.equal(aggregate(rs, 'sum v').value, 7);
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'avg v').value, null);
  const ps = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepEqual(aggregate(ps, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate(ps, 'p50 v').value, 5);
  assert.equal(aggregate([], 'p99 v').value, null);
});
test('histogram điền mốc trống', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const r = aggregate([{ '@t': t }, { '@t': t + 180000 }, { x: 1 }], 'histogram 1m');
  assert.equal(r.interval, '1m');
  assert.deepEqual(r.buckets.map((b) => b.count), [1, 0, 0, 1]);
  assert.equal(r.buckets[0].key, '2024-01-01T00:00:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});
test('spec sai', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 a', 'top a', 'sum', 'p75 a', 'histogram 0m', 'histogram 5x', 'COUNT', 'histogram m'])
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
});
