'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../src/agg');

const throwsInv = (s) => assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'));

test('count', () => {
  assert.deepStrictEqual(aggregate([{}, {}, {}], '  count '), { type: 'count', value: 3 });
  assert.deepStrictEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});

test('count by: bỏ thiếu/null, giữ kiểu, sắp xếp & hòa', () => {
  const r = [{ a: 2 }, { a: 'b' }, { a: 'a' }, { a: null }, {}, { a: 2 }, { a: 'a' }, { a: 10 }];
  const out = aggregate(r, 'count   by a');
  assert.strictEqual(out.type, 'count_by');
  assert.strictEqual(out.field, 'a');
  assert.deepStrictEqual(out.buckets, [
    { key: 2, count: 2 }, { key: 'a', count: 2 }, { key: 10, count: 1 }, { key: 'b', count: 1 },
  ]);
  assert.deepStrictEqual(aggregate([], 'count by a').buckets, []);
});

test('top', () => {
  const r = [{ a: 'x' }, { a: 'y' }, { a: 'y' }, { a: 'z' }];
  assert.deepStrictEqual(aggregate(r, 'top 2 a'), { type: 'top', field: 'a', buckets: [{ key: 'y', count: 2 }, { key: 'x', count: 1 }] });
  assert.strictEqual(aggregate(r, 'top 10 a').buckets.length, 3);
});

test('sum/avg/min/max', () => {
  const r = [{ v: 1 }, { v: '2.5' }, { v: 'abc' }, { v: '-1' }, {}, { v: null }, { v: true }];
  assert.deepStrictEqual(aggregate(r, 'sum v'), { type: 'sum', field: 'v', value: 2.5 });
  assert.strictEqual(aggregate(r, 'min v').value, -1);
  assert.strictEqual(aggregate(r, 'max v').value, 2.5);
  assert.strictEqual(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  for (const c of ['sum', 'avg', 'min', 'max']) {
    assert.deepStrictEqual(aggregate([{ v: 'x' }], c + ' v'), { type: c, field: 'v', value: null });
  }
});

test('percentile nearest-rank', () => {
  const r = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.strictEqual(aggregate(r, 'p50 v').value, 5);
  assert.strictEqual(aggregate(r, 'p90 v').value, 9);
  assert.strictEqual(aggregate(r, 'p95 v').value, 10);
  assert.strictEqual(aggregate(r, 'p99 v').type, 'p99');
  assert.strictEqual(aggregate([{ v: '7' }], 'p50 v').value, 7);
  assert.strictEqual(aggregate([], 'p95 v').value, null);
});

test('histogram', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const r = [{ '@t': t }, { '@t': t + 1000 }, { '@t': t + 125000 }, { x: 1 }];
  const out = aggregate(r, 'histogram 1m');
  assert.strictEqual(out.interval, '1m');
  assert.deepStrictEqual(out.buckets, [
    { key: '2024-01-01T00:00:00.000Z', count: 2 },
    { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 1 },
  ]);
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
  assert.strictEqual(aggregate([{ '@t': 0 }, { '@t': 86400000 }], 'histogram 1d').buckets.length, 2);
  assert.strictEqual(aggregate([{ '@t': 0 }, { '@t': 5000 }], 'histogram 5s').buckets.length, 2);
});

test('spec không hợp lệ', () => {
  for (const s of ['', '   ', 'foo', 'COUNT', 'count by', 'count x', 'top', 'top 3', 'top 0 a', 'top 1.5 a', 'top -1 a', 'top x a',
    'sum', 'sum a b', 'p50', 'p75 a', 'histogram', 'histogram 0s', 'histogram 5x', 'histogram s', 'histogram 1.5m', 'histogram 1m 2m']) throwsInv(s);
  assert.throws(() => aggregate([], undefined), /invalid aggregation/);
});
