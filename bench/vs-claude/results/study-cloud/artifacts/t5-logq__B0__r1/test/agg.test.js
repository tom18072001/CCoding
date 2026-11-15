'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/agg.js');

test('count', () => {
  assert.deepEqual(aggregate([{}, {}, {}], 'count'), { type: 'count', value: 3 });
  assert.deepEqual(aggregate([], '  count  '), { type: 'count', value: 0 });
});

test('count by: bỏ thiếu/null, hòa theo String(key)', () => {
  const r = [{ s: 'b' }, { s: 'a' }, { s: null }, {}, { s: 'c' }, { s: 'c' }];
  assert.deepEqual(aggregate(r, 'count   by s'), {
    type: 'count_by', field: 's',
    buckets: [{ key: 'c', count: 2 }, { key: 'a', count: 1 }, { key: 'b', count: 1 }],
  });
});

test('count by: 500 và "500" là hai bucket, giữ kiểu', () => {
  const r = [{ c: 500 }, { c: '500' }, { c: 500 }];
  assert.deepEqual(aggregate(r, 'count by c').buckets, [{ key: 500, count: 2 }, { key: '500', count: 1 }]);
  const tie = aggregate([{ c: 500 }, { c: '500' }], 'count by c').buckets;
  assert.deepEqual(tie, [{ key: 500, count: 1 }, { key: '500', count: 1 }]);
});

test('top n', () => {
  const r = [{ s: 'a' }, { s: 'b' }, { s: 'b' }, { s: 'c' }];
  assert.deepEqual(aggregate(r, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }, { key: 'a', count: 1 }] });
  assert.equal(aggregate(r, 'top 10 s').buckets.length, 3);
});

test('sum/avg/min/max', () => {
  const r = [{ x: 1 }, { x: '2.5' }, { x: 'abc' }, {}, { x: null }, { x: 3 }];
  assert.deepEqual(aggregate(r, 'sum x'), { type: 'sum', field: 'x', value: 6.5 });
  assert.deepEqual(aggregate(r, 'min x'), { type: 'min', field: 'x', value: 1 });
  assert.deepEqual(aggregate(r, 'max x'), { type: 'max', field: 'x', value: 3 });
  assert.equal(aggregate([{ x: 1 }, { x: 2 }, { x: 2 }], 'avg x').value, 1.6667);
  assert.equal(aggregate([{ x: 1 }, { x: 2 }], 'avg x').value, 1.5);
  for (const k of ['sum', 'avg', 'min', 'max']) assert.deepEqual(aggregate([{ y: 'z' }], k + ' x'), { type: k, field: 'x', value: null });
  assert.equal(aggregate([{ x: '-4' }], 'min x').value, -4);
});

test('percentile nearest-rank', () => {
  const r = [];
  for (let i = 100; i >= 1; i--) r.push({ v: i });
  assert.equal(aggregate(r, 'p50 v').value, 50);
  assert.equal(aggregate(r, 'p90 v').value, 90);
  assert.equal(aggregate(r, 'p95 v').value, 95);
  assert.deepEqual(aggregate(r, 'p99 v'), { type: 'p99', field: 'v', value: 99 });
  const small = [{ v: 10 }, { v: 20 }, { v: 30 }];
  assert.equal(aggregate(small, 'p50 v').value, 20);
  assert.equal(aggregate(small, 'p99 v').value, 30);
  assert.equal(aggregate([{ v: 7 }], 'p50 v').value, 7);
  assert.equal(aggregate([{ v: 'q' }], 'p95 v').value, null);
  assert.equal(aggregate([], 'p95 v').value, null);
});

test('histogram có lỗ giữa', () => {
  const r = [{ '@t': 0 }, { '@t': 500 }, { '@t': 3000 }, { '@t': '5' }, { '@t': NaN }, {}];
  assert.deepEqual(aggregate(r, 'histogram 1s'), {
    type: 'histogram', interval: '1s',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 2 },
      { key: '1970-01-01T00:00:01.000Z', count: 0 },
      { key: '1970-01-01T00:00:02.000Z', count: 0 },
      { key: '1970-01-01T00:00:03.000Z', count: 1 },
    ],
  });
});

test('histogram: đơn vị, thứ tự, rỗng', () => {
  const t = Date.UTC(2024, 0, 1, 10, 7);
  const r = [{ '@t': t + 3600000 }, { '@t': t }];
  assert.deepEqual(aggregate(r, 'histogram 1h').buckets.map((b) => b.key), ['2024-01-01T10:00:00.000Z', '2024-01-01T11:00:00.000Z']);
  assert.deepEqual(aggregate([{ '@t': t }], 'histogram 5m').buckets, [{ key: '2024-01-01T10:05:00.000Z', count: 1 }]);
  assert.deepEqual(aggregate([{ '@t': t }], 'histogram 1d').buckets, [{ key: '2024-01-01T00:00:00.000Z', count: 1 }]);
  assert.deepEqual(aggregate([{ a: 1 }], 'histogram 1m'), { type: 'histogram', interval: '1m', buckets: [] });
  assert.deepEqual(aggregate([], 'histogram 1m').buckets, []);
  assert.equal(aggregate([{ '@t': -1 }], 'histogram 1s').buckets[0].key, '1969-12-31T23:59:59.000Z');
});

test('spec sai → invalid aggregation (kể cả records rỗng)', () => {
  const bad = ['', '   ', 'foo', 'COUNT', 'Count By x', 'count by', 'count x', 'count by a b', 'count extra',
    'top', 'top 3', 'top 0 f', 'top 1.5 f', 'top -1 f', 'top x f', 'top 1 f g', 'sum', 'sum a b', 'avg',
    'p50', 'p75 x', 'P95 x', 'p95 a b', 'histogram', 'histogram 0s', 'histogram 5x', 'histogram 1.5m',
    'histogram -1s', 'histogram s', 'histogram 1', 'histogram 1s 2s', 'histogram 1S', 'min', 'max a b'];
  for (const s of bad) {
    for (const recs of [[], [{ a: 1, '@t': 1 }]]) {
      assert.throws(() => aggregate(recs, s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), JSON.stringify(s));
    }
  }
  assert.throws(() => aggregate([], undefined), /^Error: invalid aggregation/);
});
