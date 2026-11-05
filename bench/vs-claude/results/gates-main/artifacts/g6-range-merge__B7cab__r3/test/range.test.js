'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');
const R = (start, end) => ({ start, end });

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps: chạm đầu mút không chồng', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp xếp', () => {
  assert.deepEqual(mergeRanges([R(5, 8), R(1, 4), R(3, 6)]), [R(1, 8)]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(3, 5), R(1, 3)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges khoảng lồng nhau', () => {
  assert.deepEqual(mergeRanges([R(1, 10), R(2, 3)]), [R(1, 10)]);
});
test('mergeRanges start >= end ném RangeError', () => {
  assert.throws(() => mergeRanges([R(1, 2), R(4, 4)]), RangeError);
  assert.throws(() => mergeRanges([R(5, 2)]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [R(5, 8), R(1, 6)];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out[0], input[1]);
});
test('mergeRanges chuỗi chạm đầu mút giữ nguyên 3 khoảng', () => {
  assert.deepEqual(mergeRanges([R(3, 4), R(1, 2), R(2, 3)]), [R(1, 2), R(2, 3), R(3, 4)]);
});
test('mergeRanges khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(1, 3), R(1, 3)]), [R(1, 3)]);
});
test('mergeRanges khoảng có start bằng nhau', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(1, 7), R(1, 5)]), [R(1, 7)]);
});
test('mergeRanges khoảng không hợp lệ giữa mảng: ném lỗi, không đổi đầu vào', () => {
  const input = [R(5, 8), R(6, 6), R(1, 3)];
  const copy = JSON.parse(JSON.stringify(input));
  assert.throws(() => mergeRanges(input), RangeError);
  assert.deepEqual(input, copy);
});
