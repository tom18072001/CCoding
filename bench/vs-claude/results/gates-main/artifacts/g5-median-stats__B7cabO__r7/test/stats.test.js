'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });

test('median chẵn, số nhiều chữ số, không đổi đầu vào', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([10, 9, 100]), 10);
  const a = [3, 1, 2];
  median(a);
  assert.deepEqual(a, [3, 1, 2]);
});
test('median số âm và số thập phân', () => {
  assert.equal(median([-3, -1, -2]), -2);
  assert.equal(median([-4, 2, -1, 0.5]), -0.25);
  assert.equal(median([1.5, 0.5]), 1);
});
test('summary', () => {
  const a = [10, 2, 33, 4];
  assert.deepEqual(summary(a), { count: 4, min: 2, max: 33, mean: 12.25, median: 7 });
  assert.deepEqual(a, [10, 2, 33, 4]);
  assert.equal(summary([1, 2, 2]).mean, 1.67);
  assert.deepEqual(summary([-5]), { count: 1, min: -5, max: -5, mean: -5, median: -5 });
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
