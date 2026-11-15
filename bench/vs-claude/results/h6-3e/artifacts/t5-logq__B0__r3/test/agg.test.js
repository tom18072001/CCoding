'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

test('count và count by: bỏ thiếu/null, giữ kiểu, hòa theo String(key)', () => {
  const r = [{ a: 'b' }, { a: 'a' }, { a: 1 }, { a: '1' }, { a: null }, {}, { a: 'b' }];
  assert.deepStrictEqual(aggregate(r, 'count'), { type: 'count', value: 7 });
  const res = aggregate(r, 'count by a');
  assert.deepStrictEqual(res.buckets, [
    { key: 'b', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'a', count: 1 },
  ]);
});

test('top n cắt đầu danh sách', () => {
  const r = [{ a: 'x' }, { a: 'y' }, { a: 'y' }, { a: 'z' }];
  const res = aggregate(r, 'top 2 a');
  assert.strictEqual(res.type, 'top');
  assert.deepStrictEqual(res.buckets, [{ key: 'y', count: 2 }, { key: 'x', count: 1 }]);
  assert.throws(() => aggregate(r, 'top 0 a'));
});

test('sum/avg/min/max: chuỗi số, null khi rỗng, avg làm tròn 4 chữ số', () => {
  const r = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: 2 }];
  assert.strictEqual(aggregate(r, 'sum v').value, 5);
  assert.strictEqual(aggregate(r, 'min v').value, 1);
  assert.strictEqual(aggregate(r, 'max v').value, 2);
  assert.strictEqual(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  assert.strictEqual(aggregate([{ v: 'x' }], 'sum v').value, null);
  assert.strictEqual(aggregate([], 'avg v').value, null);
});

test('percentile nearest-rank', () => {
  const r = [15, 20, 35, 40, 50].map((v) => ({ v }));
  assert.deepStrictEqual(aggregate(r, 'p50 v'), { type: 'p50', field: 'v', value: 35 });
  assert.strictEqual(aggregate(r, 'p99 v').value, 50);
  assert.strictEqual(aggregate([], 'p95 v').value, null);
});

test('histogram: điền mốc trống, sắp tăng dần, bỏ bản ghi không có @t', () => {
  const m = 60000;
  const r = [{ '@t': 0 }, { '@t': 5 * m + 1 }, { '@t': 5 * m + 2 }, { msg: 'no t' }];
  const res = aggregate(r, 'histogram 2m');
  assert.strictEqual(res.interval, '2m');
  assert.deepStrictEqual(res.buckets, [
    { key: '1970-01-01T00:00:00.000Z', count: 1 },
    { key: '1970-01-01T00:02:00.000Z', count: 0 },
    { key: '1970-01-01T00:04:00.000Z', count: 2 },
  ]);
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 1h').buckets, []);
  assert.throws(() => aggregate([], 'histogram 0s'));
  assert.throws(() => aggregate([], 'histogram 5x'));
});

test('spec sai ném lỗi', () => {
  assert.throws(() => aggregate([], 'bogus'), /invalid aggregation/);
});
