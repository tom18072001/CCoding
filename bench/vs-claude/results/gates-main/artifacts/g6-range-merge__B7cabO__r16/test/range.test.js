'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút không chồng', () => {
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
test('mergeRanges khoảng lồng nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges ném RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 5, end: 8 }, { start: 1, end: 6 }];
  const snap = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, snap);
  assert.notEqual(out[0], input[0]);
  assert.notEqual(out[0], input[1]);
});

test('mergeRanges khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 2, end: 5 }, { start: 2, end: 5 }]), [{ start: 2, end: 5 }]);
});
test('mergeRanges chồng bắc cầu A-B, B-C, A không chồng C', () => {
  const a = { start: 1, end: 4 }, b = { start: 3, end: 7 }, c = { start: 6, end: 9 };
  assert.equal(overlaps(a, c), false);
  assert.deepEqual(mergeRanges([c, a, b]), [{ start: 1, end: 9 }]);
});
test('mergeRanges ném RangeError khi khoảng lỗi ở đầu mảng', () => {
  assert.throws(() => mergeRanges([{ start: 9, end: 1 }, { start: 1, end: 2 }]), RangeError);
});
test('mergeRanges với số âm', () => {
  assert.deepEqual(
    mergeRanges([{ start: 0, end: 2 }, { start: -5, end: -1 }, { start: -3, end: 1 }, { start: -10, end: -8 }]),
    [{ start: -10, end: -8 }, { start: -5, end: 2 }]
  );
  assert.throws(() => mergeRanges([{ start: -1, end: -5 }]), RangeError);
});
