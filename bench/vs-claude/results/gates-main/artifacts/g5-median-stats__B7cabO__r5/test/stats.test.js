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
test('summary', () => {
  assert.deepEqual(summary([10, 2, 3, 1]), { count: 4, min: 1, max: 10, mean: 4, median: 2.5 });
  assert.equal(summary([1, 2, 2]).mean, 1.67);
});
test('summary rỗng và không đổi đầu vào', () => {
  assert.throws(() => summary([]), RangeError);
  const xs = [3, 1, 2];
  summary(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});
test('median chẵn với số âm và số thực', () => {
  assert.equal(median([-3, -1, 0.5, 2.5]), -0.25);
});
test('summary một phần tử', () => {
  assert.deepEqual(summary([7]), { count: 1, min: 7, max: 7, mean: 7, median: 7 });
});
