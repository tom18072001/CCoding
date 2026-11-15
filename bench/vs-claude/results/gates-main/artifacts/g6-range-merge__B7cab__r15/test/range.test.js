'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');
const R = (start, end) => ({ start, end });

test('overlaps: chạm đầu mút không chồng', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(mergeRanges([R(6, 8), R(1, 4), R(3, 5)]), [R(1, 5), R(6, 8)]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(3, 5)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges khoảng lồng nhau', () => { assert.deepEqual(mergeRanges([R(1, 10), R(2, 3)]), [R(1, 10)]); });
test('mergeRanges start >= end → RangeError', () => {
  assert.throws(() => mergeRanges([R(1, 2), R(5, 5)]), RangeError);
  assert.throws(() => mergeRanges([R(4, 2)]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [R(3, 5), R(1, 4)];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out[0], input[1]);
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });

test('mergeRanges khoảng trùng hệt nhau', () => { assert.deepEqual(mergeRanges([R(2, 5), R(2, 5)]), [R(2, 5)]); });
test('mergeRanges chuỗi chồng liên tiếp, input chưa sắp xếp', () => {
  assert.deepEqual(mergeRanges([R(7, 10), R(1, 3), R(5, 8), R(2, 6)]), [R(1, 10)]);
});
