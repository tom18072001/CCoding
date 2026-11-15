'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');
const R = (start, end) => ({ start, end });

test('overlaps: chạm đầu mút không chồng', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng, sắp theo start', () => {
  assert.deepEqual(mergeRanges([R(5, 8), R(1, 4), R(3, 6)]), [R(1, 8)]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(3, 5), R(1, 3)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(mergeRanges([R(1, 10), R(2, 3)]), [R(1, 10)]);
});
test('mergeRanges start >= end ném RangeError', () => {
  assert.throws(() => mergeRanges([R(2, 2)]), RangeError);
  assert.throws(() => mergeRanges([R(1, 2), R(5, 3)]), RangeError);
});
test('mergeRanges không đột biến đầu vào', () => {
  const input = [R(3, 6), R(1, 4)];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  out[0].end = 99;
  assert.deepEqual(input, copy);
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });

test('mergeRanges khoảng giống hệt nhau', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(1, 3)]), [R(1, 3)]);
});
test('mergeRanges khoảng bao trọn nhiều khoảng, đầu vào chưa sắp', () => {
  assert.deepEqual(mergeRanges([R(4, 5), R(2, 3), R(0, 10), R(20, 25), R(12, 13)]), [R(0, 10), R(12, 13), R(20, 25)]);
});
test('mergeRanges NaN ném RangeError', () => {
  assert.throws(() => mergeRanges([R(NaN, 3)]), RangeError);
  assert.throws(() => mergeRanges([R(1, NaN)]), RangeError);
});
