'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps: chạm đầu mút không chồng', () => { assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng, sắp theo start, chứa nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 8 }, { start: 1, end: 5 }, { start: 3, end: 4 }, { start: 4, end: 7 }]), [{ start: 1, end: 8 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges ném RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 4, end: 6 }, { start: 1, end: 5 }];
  const snap = JSON.parse(JSON.stringify(input));
  mergeRanges(input);
  assert.deepEqual(input, snap);
});
