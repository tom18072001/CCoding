'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count / count by / top', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  const rs = [{ s: 2 }, { s: 10 }, { s: 10 }, { s: 2 }, { s: null }, {}, { s: 'a' }];
  assert.deepEqual(aggregate(rs, 'count by s').buckets, [{ key: 10, count: 2 }, { key: 2, count: 2 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 10, count: 2 }] });
});
test('sum avg min max', () => {
  const rs = [{ v: 1 }, { v: '2.5' }, { v: 'x' }, { v: true }, {}];
  assert.equal(aggregate(rs, 'sum v').value, 3.5);
  assert.equal(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 2.5);
  assert.deepEqual(aggregate([], 'avg v'), { type: 'avg', field: 'v', value: null });
});
test('percentile', () => {
  const rs = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.equal(aggregate(rs, 'p50 v').value, 5);
  assert.equal(aggregate(rs, 'p95 v').value, 10);
  assert.equal(aggregate(rs, 'p90 v').value, 9);
  assert.deepEqual(aggregate([], 'p99 v'), { type: 'p99', field: 'v', value: null });
});
test('histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const res = aggregate([t('2024-01-01T00:02:00Z'), t('2024-01-01T00:00:10Z'), t('2024-01-01T00:00:20Z'), {}], 'histogram 1m');
  assert.deepEqual(res, { type: 'histogram', interval: '1m', buckets: [
    { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 }, { key: '2024-01-01T00:02:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});
test('spec sai', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 a', 'top x a', 'sum', 'p75 a', 'histogram 0m', 'histogram 5x', 'histogram m', 'COUNT', 'count x']) {
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
  }
});
