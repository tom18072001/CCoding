'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút là false', () => {
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
  assert.equal(overlaps({ start: 3, end: 5 }, { start: 1, end: 3 }), false);
});

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 7 }]), [{ start: 1, end: 9 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges start >= end ném RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 5, end: 8 }, { start: 1, end: 6 }];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out[0], input[0]);
  assert.notEqual(out[0], input[1]);
});

test('mergeRanges khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 4 }, { start: 1, end: 4 }]), [{ start: 1, end: 4 }]);
});
test('mergeRanges nối chuỗi nhiều khoảng', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }, { start: 10, end: 12 }]),
    [{ start: 1, end: 8 }, { start: 10, end: 12 }],
  );
});
test('mergeRanges NaN ném RangeError', () => {
  assert.throws(() => mergeRanges([{ start: NaN, end: 3 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: NaN }]), RangeError);
});
test('mergeRanges không đổi mảng đầu vào (thứ tự)', () => {
  const input = [{ start: 5, end: 8 }, { start: 1, end: 2 }];
  mergeRanges(input);
  assert.equal(input[0].start, 5);
});
