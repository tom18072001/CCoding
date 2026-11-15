'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút không chồng', () => { assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp xếp', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 7 }]), [{ start: 1, end: 9 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges khoảng chứa khoảng', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 5, end: 1 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 3, end: 6 }, { start: 1, end: 4 }];
  const copy = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out[0], input[1]);
});
test('mergeRanges RangeError khi khoảng sai đứng sau khoảng hợp lệ', () => {
  assert.throws(() => mergeRanges([{ start: 1, end: 3 }, { start: 4, end: 4 }]), RangeError);
});
test('mergeRanges các khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 4 }, { start: 1, end: 4 }]), [{ start: 1, end: 4 }]);
});
test('mergeRanges gộp chuỗi nhiều khoảng, chạm đầu mút giữ riêng', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }, { start: 8, end: 9 }, { start: 20, end: 25 }]),
    [{ start: 1, end: 8 }, { start: 8, end: 9 }, { start: 20, end: 25 }]
  );
});
test('mergeRanges không đổi từng đối tượng đầu vào khi gộp', () => {
  const a = { start: 1, end: 4 };
  const b = { start: 2, end: 9 };
  mergeRanges([a, b]);
  assert.deepEqual(a, { start: 1, end: 4 });
  assert.deepEqual(b, { start: 2, end: 9 });
});
