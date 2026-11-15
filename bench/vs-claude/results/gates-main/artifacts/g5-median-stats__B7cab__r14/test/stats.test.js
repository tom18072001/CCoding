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
  assert.equal(median([10, 9, 2]), 9);
});
test('median không đổi mảng đầu vào', () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('summary', () => {
  assert.deepEqual(summary([10, 1, 4, 2]), { count: 4, min: 1, max: 10, mean: 4.25, median: 3 });
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng và không đổi đầu vào', () => {
  assert.throws(() => summary([]), RangeError);
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('median 1 phần tử, số âm, số thập phân', () => {
  assert.equal(median([7]), 7);
  assert.equal(median([-5, -1, -3]), -3);
  assert.equal(median([-2, -1, 3, 4]), 1);
  assert.equal(median([0.5, 1.5]), 1);
});
test('summary ca biên', () => {
  assert.deepEqual(summary([5]), { count: 1, min: 5, max: 5, mean: 5, median: 5 });
  assert.deepEqual(summary([-3, -1, -2]), { count: 3, min: -3, max: -1, mean: -2, median: -2 });
  assert.deepEqual(summary([0.1, 0.2]), { count: 2, min: 0.1, max: 0.2, mean: 0.15, median: 0.15000000000000002 });
  assert.equal(typeof summary([1, 2, 2]).mean, 'number');
  assert.equal(summary([1, 1, 2]).mean, 1.33);
});
