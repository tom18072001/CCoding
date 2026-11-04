'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });

test('median chẵn', () => { assert.equal(median([4, 1, 3, 2]), 2.5); });
test('median sắp xếp số, không phải chuỗi', () => { assert.equal(median([10, 9, 100]), 10); });
test('median không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary', () => {
  assert.deepEqual(summary([10, 1, 4, 3]), { count: 4, min: 1, max: 10, mean: 4.5, median: 3.5 });
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng và không đổi đầu vào', () => {
  assert.throws(() => summary([]), RangeError);
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
