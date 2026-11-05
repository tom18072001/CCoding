'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');
const R = (start, end) => ({ start, end });

test('overlaps chạm đầu mút không chồng', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp xếp', () => {
  assert.deepEqual(mergeRanges([R(5, 8), R(1, 4), R(3, 6)]), [R(1, 8)]);
});
test('mergeRanges bao trọn', () => { assert.deepEqual(mergeRanges([R(1, 10), R(2, 3)]), [R(1, 10)]); });
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([R(1, 3), R(3, 5)]), [R(1, 3), R(3, 5)]);
});
test('mergeRanges start>=end ném RangeError', () => {
  assert.throws(() => mergeRanges([R(3, 3)]), RangeError);
  assert.throws(() => mergeRanges([R(1, 2), R(5, 4)]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [R(4, 6), R(1, 5)];
  const copy = JSON.parse(JSON.stringify(input));
  mergeRanges(input);
  assert.deepEqual(input, copy);
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });

test('mergeRanges nối chuỗi nhiều khoảng chưa sắp', () => {
  assert.deepEqual(mergeRanges([R(7, 9), R(3, 5), R(1, 4), R(4, 4.5 + 0.5), R(8, 12)]), [R(1, 5), R(7, 12)]);
});
test('mergeRanges trả đối tượng mới', () => {
  const a = R(1, 2);
  const out = mergeRanges([a]);
  assert.notEqual(out[0], a);
  assert.deepEqual(out, [R(1, 2)]);
});
