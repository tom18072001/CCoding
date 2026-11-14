'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src');

test('count / count by / top', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  const rs = [{ s: 2 }, { s: 10 }, { s: 2 }, { s: 10 }, { s: 'a' }, { s: null }, {}, { s: 1 }];
  assert.deepEqual(aggregate(rs, 'count   by s').buckets, [
    { key: 10, count: 2 }, { key: 2, count: 2 }, { key: 1, count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 10, count: 2 }, { key: 2, count: 2 }] });
});

test('số học và percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  assert.equal(aggregate([{ v: 'x' }], 'p50 v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.deepEqual(aggregate(ten, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p90 v').value, 9);
});

test('histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:02:10Z'), t('2024-01-01T00:00:05Z'), t('2024-01-01T00:00:50Z'), {}], 'histogram 1m');
  assert.deepEqual(r, { type: 'histogram', interval: '1m', buckets: [
    { key: '2024-01-01T00:00:00.000Z', count: 2 },
    { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([{}], 'histogram 5m').buckets, []);
});

test('spec sai', () => {
  for (const s of ['', 'COUNT', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'sum', 'p42 f', 'histogram 0m', 'histogram 5x', 'histogram m', 'foo', 'count by a b']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});

test('bucket: 1 và "1" là hai bucket, key giữ kiểu, hòa theo chuỗi', () => {
  const b = aggregate([{ k: 1 }, { k: '1' }, { k: '1' }, { k: true }, { k: 'o:{"a":1}' }, { k: { a: 1 } }], 'count by k').buckets;
  assert.deepEqual(b, [
    { key: '1', count: 2 }, { key: 1, count: 1 }, { key: 'o:{"a":1}', count: 1 },
    { key: true, count: 1 }, { key: { a: 1 }, count: 1 }].sort((x, y) => (y.count - x.count) || (String(x.key) < String(y.key) ? -1 : String(x.key) > String(y.key) ? 1 : 0)));
  assert.equal(b.length, 5);
  assert.equal(aggregate([{ k: 1 }, { k: '1' }], 'count by k').buckets[0].key, 1);
});

test('histogram: giữ nguyên chuỗi interval, đơn vị h/d/s', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  assert.equal(aggregate([], 'histogram 05m').interval, '05m');
  const h = aggregate([t('2024-01-01T00:10:00Z'), t('2024-01-03T01:00:00Z')], 'histogram 1d').buckets;
  assert.deepEqual(h.map((x) => x.count), [1, 1, 1].map((c, i) => (i === 1 ? 0 : 1)));
  assert.equal(h[2].key, '2024-01-03T00:00:00.000Z');
  assert.equal(aggregate([t('2024-01-01T00:00:00Z'), t('2024-01-01T02:59:59Z')], 'histogram 1h').buckets.length, 3);
  assert.equal(aggregate([t('2024-01-01T00:00:01Z'), t('2024-01-01T00:00:04Z')], 'histogram 2s').buckets.length, 3);
});
