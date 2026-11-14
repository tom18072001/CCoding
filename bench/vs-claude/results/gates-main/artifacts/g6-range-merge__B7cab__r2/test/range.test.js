'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút → false', () => {
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
  assert.equal(overlaps({ start: 3, end: 5 }, { start: 1, end: 3 }), false);
});

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(
    mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 5 }]),
    [{ start: 1, end: 5 }, { start: 6, end: 9 }]
  );
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(
    mergeRanges([{ start: 1, end: 3 }, { start: 3, end: 5 }]),
    [{ start: 1, end: 3 }, { start: 3, end: 5 }]
  );
});
test('mergeRanges chuỗi chồng nhau chưa sắp xếp', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }, { start: 10, end: 12 }]),
    [{ start: 1, end: 8 }, { start: 10, end: 12 }]
  );
});
test('mergeRanges khoảng lồng nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges start >= end → RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 4, end: 6 }, { start: 1, end: 5 }];
  const snapshot = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, snapshot);
  assert.notEqual(out[0], input[0]);
  assert.notEqual(out[0], input[1]);
});
