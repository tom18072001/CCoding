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
test('median sắp xếp theo số, không theo chuỗi', () => {
  assert.equal(median([10, 9, 100]), 10);
});
test('median không thay đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([1, 2, 2, 10]), { count: 4, min: 1, max: 10, mean: 3.75, median: 2 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 1, 2]).mean, 1.33);
});
test('summary một phần tử', () => {
  assert.deepEqual(summary([7]), { count: 1, min: 7, max: 7, mean: 7, median: 7 });
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
test('summary không thay đổi đầu vào', () => {
  const xs = [10, 9, 100];
  summary(xs);
  assert.deepEqual(xs, [10, 9, 100]);
});
test('summary mean [1,2,2] làm tròn lên 1.67', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng ném RangeError đúng loại', () => {
  assert.throws(() => summary([]), (e) => e instanceof RangeError);
});
test('median một phần tử và số âm', () => {
  assert.equal(median([5]), 5);
  assert.equal(median([-3, -1, -2, -4]), -2.5);
});
