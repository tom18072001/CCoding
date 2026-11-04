'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('median lẻ', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([5, 1, 4, 2, 3]), 3);
});
test('median rỗng', () => { assert.throws(() => median([]), RangeError); });
test('median chẵn, số nhiều chữ số, không đổi đầu vào', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const a = [10, 9, 100, 1];
  assert.equal(median(a), 9.5);
  assert.deepEqual(a, [10, 9, 100, 1]);
});
test('summary', () => {
  const a = [10, 2, 1];
  assert.deepEqual(summary(a), { count: 3, min: 1, max: 10, mean: 4.33, median: 2 });
  assert.deepEqual(a, [10, 2, 1]);
  assert.equal(summary([1, 2, 3, 4]).median, 2.5);
});
test('summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
test('median một phần tử', () => { assert.equal(median([7]), 7); });
test('summary mảng chẵn, mean làm tròn 2 chữ số', () => {
  assert.deepEqual(summary([1, 2, 2, 10]), { count: 4, min: 1, max: 10, mean: 3.75, median: 2 });
  assert.equal(summary([1, 1, 2]).mean, 1.33);
});
