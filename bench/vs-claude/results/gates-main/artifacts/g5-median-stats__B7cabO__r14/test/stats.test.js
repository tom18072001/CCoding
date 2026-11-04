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
test('median so sánh số, không phải chuỗi', () => {
  assert.equal(median([10, 9, 100]), 10);
});
test('median không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([4, 1, 3, 2]), { count: 4, min: 1, max: 4, mean: 2.5, median: 2.5 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary số âm và 1 phần tử', () => {
  assert.deepEqual(summary([-5]), { count: 1, min: -5, max: -5, mean: -5, median: -5 });
});
test('summary rỗng → RangeError', () => { assert.throws(() => summary([]), RangeError); });
test('summary không đổi đầu vào', () => {
  const xs = [10, 9, 100];
  summary(xs);
  assert.deepEqual(xs, [10, 9, 100]);
});
test('median một phần tử và số âm', () => {
  assert.equal(median([7]), 7);
  assert.equal(median([-3, -1, -2]), -2);
  assert.equal(median([-4, 4]), 0);
});
test('summary median đúng khi số phần tử chẵn, có số âm', () => {
  assert.deepEqual(summary([100, -10, 9, 10]), { count: 4, min: -10, max: 100, mean: 27.25, median: 9.5 });
});
