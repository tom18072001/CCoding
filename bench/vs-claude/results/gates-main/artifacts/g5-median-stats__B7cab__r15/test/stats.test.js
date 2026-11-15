'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });
test('median chẵn', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([1, 2]), 1.5);
});
test('median sắp xếp theo số, không theo chuỗi', () => {
  assert.equal(median([10, 9, 2]), 9);
  assert.equal(median([100, 20, 3]), 20);
});
test('median không đổi mảng đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([10, 9, 2, 5]), { count: 4, min: 2, max: 10, mean: 6.5, median: 7 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary một phần tử và số âm', () => {
  assert.deepEqual(summary([-3]), { count: 1, min: -3, max: -3, mean: -3, median: -3 });
});
test('summary rỗng ném RangeError', () => { assert.throws(() => summary([]), RangeError); });
test('summary không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary số thập phân và số âm', () => {
  assert.deepEqual(summary([-1.5, 2.25, 0.5]), { count: 3, min: -1.5, max: 2.25, mean: 0.42, median: 0.5 });
});
