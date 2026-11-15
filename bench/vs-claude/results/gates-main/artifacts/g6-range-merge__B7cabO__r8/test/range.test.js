'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps: chạm đầu mút không chồng', () => {
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
  assert.equal(overlaps({ start: 3, end: 5 }, { start: 1, end: 3 }), false);
});
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng, sắp theo start, chứa nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 5 }, { start: 3, end: 4 }, { start: 4, end: 7 }]),
    [{ start: 1, end: 9 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]),
    [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges ném RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 4, end: 8 }, { start: 1, end: 5 }];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out[0], input[1]);
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });

test('mergeRanges: [1,3)+[3,5) giữ riêng, không gộp', () => {
  assert.equal(mergeRanges([{ start: 1, end: 3 }, { start: 3, end: 5 }]).length, 2);
});
test('mergeRanges: khoảng lồng nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges: đầu vào không sắp xếp, nhiều nhóm tách rời', () => {
  assert.deepEqual(mergeRanges([{ start: 8, end: 9 }, { start: 1, end: 3 }, { start: 2, end: 4 }]),
    [{ start: 1, end: 4 }, { start: 8, end: 9 }]);
});
test('mergeRanges: start == end và start > end ném RangeError riêng', () => {
  assert.throws(() => mergeRanges([{ start: 4, end: 4 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 5, end: 1 }]), RangeError);
});
test('mergeRanges: không sửa mảng/đối tượng đầu vào (đóng băng sâu)', () => {
  const input = Object.freeze([Object.freeze({ start: 4, end: 8 }), Object.freeze({ start: 1, end: 5 })]);
  assert.deepEqual(mergeRanges(input), [{ start: 1, end: 8 }]);
});
test('overlaps: lồng nhau là chồng', () => {
  assert.equal(overlaps({ start: 1, end: 10 }, { start: 2, end: 3 }), true);
});
