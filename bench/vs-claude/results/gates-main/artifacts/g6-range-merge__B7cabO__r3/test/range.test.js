'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

const R = (start, end) => ({ start, end });

test('overlaps chồng rõ', () => { assert.equal(overlaps(R(1, 5), R(3, 8)), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps(R(1, 2), R(5, 8)), false); });
test('overlaps chạm đầu mút không chồng', () => {
  assert.equal(overlaps(R(1, 3), R(3, 5)), false);
  assert.equal(overlaps(R(3, 5), R(1, 3)), false);
});

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(mergeRanges([R(6, 9), R(1, 4), R(3, 5)]), [R(1, 5), R(6, 9)]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(3, 5)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges khoảng chứa khoảng khác', () => {
  assert.deepEqual(mergeRanges([R(1, 10), R(2, 3), R(4, 5)]), [R(1, 10)]);
});
test('mergeRanges ném RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([R(3, 3)]), RangeError);
  assert.throws(() => mergeRanges([R(1, 2), R(5, 4)]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [R(3, 5), R(1, 4)];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  out[0].end = 99;
  assert.deepEqual(input, copy);
});
