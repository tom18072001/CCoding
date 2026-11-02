'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count / by / top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: 1 }, { s: null }, {}, { s: 'a' }];
  assert.equal(aggregate(rs, ' count ').value, 7);
  assert.deepEqual(aggregate(rs, 'count by s').buckets, [{ key: 'a', count: 2 }, { key: 'b', count: 2 }, { key: 1, count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 'a', count: 2 }] });
});
test('numeric', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.equal(aggregate(rs, 'sum v').value, 7);
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate(rs, 'sum z').value, null);
  const p = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v }));
  assert.deepEqual(aggregate(p, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.equal(aggregate(p, 'p95 v').value, 10);
  assert.equal(aggregate([], 'p99 v').value, null);
});
test('histogram fills gaps', () => {
  const rs = [{ '@t': 0 }, { '@t': 125000 }, { '@t': 1000 }, { x: 1 }];
  assert.deepEqual(aggregate(rs, 'histogram 1m'), { type: 'histogram', interval: '1m', buckets: [
    { key: '1970-01-01T00:00:00.000Z', count: 2 }, { key: '1970-01-01T00:01:00.000Z', count: 0 }, { key: '1970-01-01T00:02:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});
test('invalid specs', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 x', 'top x', 'top 1.5 x', 'sum', 'histogram 0m', 'histogram 5x', 'COUNT', 'p75 x', 'count x'])
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
});
