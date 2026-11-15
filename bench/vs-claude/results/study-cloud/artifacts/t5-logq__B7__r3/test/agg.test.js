'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require(require('node:path').dirname(__dirname) + '/src');

test('count, count by, top', () => {
  const rs = [{ s: 2 }, { s: '10' }, { s: 2 }, { s: null }, {}, { s: '10' }, { s: 'a' }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, 'count   by s').buckets, [
    { key: '10', count: 2 }, { key: 2, count: 2 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: '10', count: 2 }] });
});

test('sum/avg/min/max/percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p95 v').value, 10);
  assert.deepEqual(aggregate([], 'p99 v'), { type: 'p99', field: 'v', value: null });
});

test('histogram điền mốc trống', () => {
  const t = Date.parse('2024-01-01T00:00:10Z');
  const rs = [{ '@t': t }, { '@t': t + 150000 }, { '@t': t + 1 }, { x: 1 }];
  assert.deepEqual(aggregate(rs, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('spec không hợp lệ', () => {
  for (const s of ['', 'COUNT', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'sum', 'sum a b', 'p80 f',
    'histogram 0s', 'histogram 5x', 'histogram m', 'foo'])
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
});

test('bucket: số 1 và chuỗi "1" là hai bucket, key giữ kiểu; hòa theo String(key)', () => {
  const rs = [{ k: 1 }, { k: '1' }, { k: 'b' }, { k: 'a' }, { k: true }, { k: 'a' }];
  assert.deepEqual(aggregate(rs, 'count by k').buckets, [
    { key: 'a', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'b', count: 1 }, { key: true, count: 1 }]);
  assert.equal(aggregate(rs, 'top 100 k').buckets.length, 5);
  assert.equal(aggregate(rs, 'top 2 k').type, 'top');
});

test('min/max/percentile trên chuỗi số, bỏ giá trị không phải số', () => {
  const rs = [{ v: '10' }, { v: 2 }, { v: 'x' }, { v: null }, { v: false }, { v: '-3.5' }];
  assert.equal(aggregate(rs, 'min v').value, -3.5);
  assert.equal(aggregate(rs, 'max v').value, 10);
  assert.equal(aggregate(rs, 'p50 v').value, 2);
  assert.equal(aggregate(rs, 'p99 v').value, 10);
  assert.equal(aggregate([{ v: 'x' }], 'max v').value, null);
  assert.equal(aggregate([{ v: 'x' }], 'avg v').value, null);
});

test('histogram: đơn vị s/h/d, k>1, interval, sắp tăng dần', () => {
  const base = Date.parse('2024-01-01T00:00:00Z');
  const h = aggregate([{ '@t': base + 3 * 86400000 }, { '@t': base }], 'histogram 1d');
  assert.deepEqual(h.buckets.map((b) => b.count), [1, 0, 0, 1]);
  assert.equal(h.interval, '1d');
  const s = aggregate([{ '@t': base + 11000 }, { '@t': base + 1000 }], 'histogram 5s');
  assert.deepEqual(s.buckets.map((b) => b.key), ['2024-01-01T00:00:00.000Z', '2024-01-01T00:00:05.000Z', '2024-01-01T00:00:10.000Z']);
  assert.equal(aggregate([{ '@t': base }], 'histogram 2h').interval, '2h');
});
