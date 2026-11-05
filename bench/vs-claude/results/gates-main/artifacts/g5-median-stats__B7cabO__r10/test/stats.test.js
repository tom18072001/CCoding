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
  assert.equal(median([10, 9, 1]), 9);
});
test('median không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary cơ bản', () => {
  assert.deepEqual(summary([10, 2, 3, 1]), { count: 4, min: 1, max: 10, mean: 4, median: 2.5 });
});
test('summary làm tròn mean 2 chữ số', () => {
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
test('summary không đổi đầu vào', () => {
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary 1 phần tử', () => {
  assert.deepEqual(summary([7]), { count: 1, min: 7, max: 7, mean: 7, median: 7 });
});
test('summary số âm', () => {
  assert.deepEqual(summary([-5, -1, -3]), { count: 3, min: -5, max: -1, mean: -3, median: -3 });
});
test('summary số thập phân, mean làm tròn', () => {
  assert.deepEqual(summary([0.1, 0.2, 0.4]), { count: 3, min: 0.1, max: 0.4, mean: 0.23, median: 0.2 });
});
test('summary mảng lớn không tràn stack', () => {
  const xs = Array.from({ length: 300000 }, (_, i) => i);
  const r = summary(xs);
  assert.equal(r.min, 0);
  assert.equal(r.max, 299999);
});
