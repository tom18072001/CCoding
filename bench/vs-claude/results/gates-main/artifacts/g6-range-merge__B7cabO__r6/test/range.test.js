'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');
const R = (start, end) => ({ start, end });

test('overlaps: chạm đầu mút không chồng', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng, sắp theo start, lồng nhau', () => {
  assert.deepEqual(mergeRanges([R(5, 9), R(1, 4), R(3, 6), R(7, 8)]), [R(1, 9)]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(3, 5), R(1, 3)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([R(2, 2)]), RangeError);
  assert.throws(() => mergeRanges([R(1, 2), R(5, 3)]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [R(4, 6), R(1, 5)];
  const snap = JSON.stringify(input);
  const out = mergeRanges(input);
  assert.equal(JSON.stringify(input), snap);
  out[0].end = 99;
  assert.equal(input[1].end, 5);
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
