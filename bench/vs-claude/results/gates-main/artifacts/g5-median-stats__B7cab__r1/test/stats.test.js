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
});
test('median sắp xếp số, không phải chuỗi', () => {
  assert.equal(median([10, 9, 1]), 9);
});
test('median không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([10, 2, 4, 1]), { count: 4, min: 1, max: 10, mean: 4.25, median: 3 });
});
test('summary làm tròn mean', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
test('summary không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('median/summary phần tử đơn', () => {
  assert.equal(median([7]), 7);
  assert.deepEqual(summary([7]), { count: 1, min: 7, max: 7, mean: 7, median: 7 });
});
test('median/summary số âm', () => {
  assert.equal(median([-5, -1, -3]), -3);
  assert.deepEqual(summary([-5, 3, -2, 0]), { count: 4, min: -5, max: 3, mean: -1, median: -1 });
});
test('median/summary có trùng lặp', () => {
  assert.equal(median([2, 2, 2, 5]), 2);
  assert.deepEqual(summary([2, 2, 5, 5]), { count: 4, min: 2, max: 5, mean: 3.5, median: 3.5 });
});
