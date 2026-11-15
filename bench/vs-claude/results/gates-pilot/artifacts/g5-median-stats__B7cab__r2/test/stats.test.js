'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });
test('median chẵn: trung bình hai phần tử giữa', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
test('median sắp xếp theo số, không theo chuỗi', () => {
  assert.equal(median([10, 9, 1]), 9);
});
test('median không làm thay đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([10, 2, 4, 4]), { count: 4, min: 2, max: 10, mean: 5, median: 4 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary một phần tử và số âm', () => {
  assert.deepEqual(summary([-5]), { count: 1, min: -5, max: -5, mean: -5, median: -5 });
});
test('summary rỗng ném RangeError', () => { assert.throws(() => summary([]), RangeError); });
test('summary không làm thay đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
