'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median chẵn', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
test('median sắp xếp theo số, không theo chuỗi', () => {
  assert.equal(median([10, 9, 100]), 10);
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
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });
