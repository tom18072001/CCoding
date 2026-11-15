'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { aggregate } = require(path.join(__dirname, '..', 'src', 'agg'));

test('count', () => {
  assert.deepStrictEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  assert.deepStrictEqual(aggregate([], 'count'), { type: 'count', value: 0 });
});
test('count by: bỏ thiếu/null, giữ kiểu, sắp count giảm rồi key tăng', () => {
  const recs = [{ s: 500 }, { s: 200 }, { s: 200 }, { s: null }, {}, { s: 404 }, { s: 'b' }, { s: 'a' }];
  const r = aggregate(recs, 'count   by s');
  assert.strictEqual(r.type, 'count_by');
  assert.strictEqual(r.field, 's');
  assert.deepStrictEqual(r.buckets, [
    { key: 200, count: 2 }, { key: 404, count: 1 }, { key: 500, count: 1 },
    { key: 'a', count: 1 }, { key: 'b', count: 1 },
  ]);
  assert.strictEqual(typeof r.buckets[0].key, 'number');
});
test('count by: hòa theo so sánh chuỗi thường (hoa trước thường, "10" < "9")', () => {
  const r = aggregate([{ k: 'b' }, { k: 'B' }, { k: 9 }, { k: 10 }], 'count by k');
  assert.deepStrictEqual(r.buckets.map((b) => b.key), [10, 9, 'B', 'b']);
});
test('top: giới hạn n và type', () => {
  const recs = [{ f: 'x' }, { f: 'x' }, { f: 'y' }, { f: 'z' }];
  assert.deepStrictEqual(aggregate(recs, 'top 2 f'), {
    type: 'top', field: 'f', buckets: [{ key: 'x', count: 2 }, { key: 'y', count: 1 }],
  });
  assert.strictEqual(aggregate(recs, 'top 10 f').buckets.length, 3);
  for (const s of ['top 0 f', 'top -1 f', 'top 1.5 f', 'top x f', 'top f', 'top 2']) {
    assert.throws(() => aggregate(recs, s), /^Error: invalid aggregation/);
  }
});
test('sum/avg/min/max: chỉ giá trị số, chuỗi số được đổi', () => {
  const recs = [{ v: 1 }, { v: '2.5' }, { v: 'abc' }, { v: true }, { v: null }, {}, { v: '-3' }];
  assert.deepStrictEqual(aggregate(recs, 'sum v'), { type: 'sum', field: 'v', value: 0.5 });
  assert.strictEqual(aggregate(recs, 'min v').value, -3);
  assert.strictEqual(aggregate(recs, 'max v').value, 2.5);
  assert.strictEqual(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  for (const c of ['sum', 'avg', 'min', 'max']) {
    assert.deepStrictEqual(aggregate([{ v: 'x' }], c + ' v'), { type: c, field: 'v', value: null });
  }
});
test('percentile nearest-rank', () => {
  const recs = [];
  for (let i = 100; i >= 1; i--) recs.push({ v: i });
  assert.strictEqual(aggregate(recs, 'p50 v').value, 50);
  assert.strictEqual(aggregate(recs, 'p90 v').value, 90);
  assert.strictEqual(aggregate(recs, 'p95 v').value, 95);
  assert.deepStrictEqual(aggregate(recs, 'p99 v'), { type: 'p99', field: 'v', value: 99 });
  const five = [10, 20, 30, 40, 50].map((v) => ({ v }));
  assert.strictEqual(aggregate(five, 'p50 v').value, 30);
  assert.strictEqual(aggregate(five, 'p99 v').value, 50);
  assert.strictEqual(aggregate([{ v: 7 }], 'p50 v').value, 7);
  assert.strictEqual(aggregate([{ v: 'x' }], 'p95 v').value, null);
  assert.strictEqual(aggregate([{ v: 9 }, { v: '10' }, { v: 2 }], 'p50 v').value, 9);
});
test('histogram: mốc, điền trống, sắp tăng, bỏ bản ghi không có @t', () => {
  const t0 = Date.parse('2024-01-01T00:00:00Z');
  const recs = [{ '@t': t0 + 5000 }, { '@t': t0 + 3 * 60000 + 1 }, { '@t': t0 + 1 }, { x: 1 }, { '@t': t0 + 3 * 60000 }];
  const r = aggregate(recs, 'histogram 1m');
  assert.strictEqual(r.type, 'histogram');
  assert.strictEqual(r.interval, '1m');
  assert.deepStrictEqual(r.buckets, [
    { key: '2024-01-01T00:00:00.000Z', count: 2 },
    { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 0 },
    { key: '2024-01-01T00:03:00.000Z', count: 2 },
  ]);
  const r2 = aggregate([{ '@t': t0 + 7200000 }, { '@t': t0 }], 'histogram 1h');
  assert.deepStrictEqual(r2.buckets.map((b) => b.count), [1, 0, 1]);
  assert.strictEqual(aggregate([{ '@t': t0 }], 'histogram 1d').buckets[0].key, '2024-01-01T00:00:00.000Z');
  assert.strictEqual(aggregate([{ '@t': t0 + 90000 }], 'histogram 30s').buckets[0].key, '2024-01-01T00:01:30.000Z');
  assert.deepStrictEqual(aggregate([{ a: 1 }], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
  assert.deepStrictEqual(aggregate([], 'histogram 5m').buckets, []);
});
test('histogram: mốc trước epoch dùng floor', () => {
  const r = aggregate([{ '@t': -1 }], 'histogram 1s');
  assert.strictEqual(r.buckets[0].key, '1969-12-31T23:59:59.000Z');
});
test('spec không hợp lệ', () => {
  for (const s of ['', '  ', 'foo', 'COUNT', 'count by', 'count x', 'sum', 'sum a b', 'p80 f', 'p50',
    'histogram', 'histogram 0m', 'histogram m', 'histogram 5x', 'histogram 1.5m', 'histogram -1m', 'histogram 5 m', 'top']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
  assert.throws(() => aggregate([], undefined), /^Error: invalid aggregation/);
});
