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
  assert.deepEqual(summary([3, 1, 2, 10]), { count: 4, min: 1, max: 10, mean: 4, median: 2.5 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 1, 2]).mean, 1.33);
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
test('summary không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('median 1 phần tử và số âm', () => {
  assert.equal(median([7]), 7);
  assert.equal(median([-5, -1, -3]), -3);
  assert.equal(median([-2, -4]), -3);
});
test('summary 1 phần tử và số âm', () => {
  assert.deepEqual(summary([-4]), { count: 1, min: -4, max: -4, mean: -4, median: -4 });
  assert.deepEqual(summary([-3, -1, -2]), { count: 3, min: -3, max: -1, mean: -2, median: -2 });
});
