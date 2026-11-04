'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

const R = (start, end) => ({ start, end });

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút không chồng', () => {
  assert.equal(overlaps(R(1, 3), R(3, 5)), false);
  assert.equal(overlaps(R(3, 5), R(1, 3)), false);
});

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(mergeRanges([R(5, 8), R(1, 4), R(3, 6)]), [R(1, 8)]);
});
test('mergeRanges giữ riêng khoảng chỉ chạm', () => {
  assert.deepEqual(mergeRanges([R(3, 5), R(1, 3)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
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
test('mergeRanges khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([R(2, 5), R(2, 5)]), [R(2, 5)]);
});
test('mergeRanges gộp dây chuyền và giữ khoảng tách rời', () => {
  assert.deepEqual(mergeRanges([R(7, 9), R(1, 3), R(2, 5), R(4, 6)]), [R(1, 6), R(7, 9)]);
});
