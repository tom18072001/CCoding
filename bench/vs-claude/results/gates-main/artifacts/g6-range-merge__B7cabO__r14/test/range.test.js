'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút không chồng', () => { assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false); });

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 7 }]), [{ start: 1, end: 9 }]);
});
test('mergeRanges giữ riêng khoảng chỉ chạm', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges ném RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const a = { start: 1, end: 4 }; const b = { start: 2, end: 6 };
  const input = [b, a];
  const out = mergeRanges(input);
  assert.deepEqual(input, [{ start: 2, end: 6 }, { start: 1, end: 4 }]);
  assert.deepEqual(a, { start: 1, end: 4 });
  assert.deepEqual(b, { start: 2, end: 6 });
  assert.notEqual(out[0], a);
});
test('mergeRanges khoảng trùng hệt nhau', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 4 }, { start: 1, end: 4 }]), [{ start: 1, end: 4 }]);
});
test('mergeRanges chuỗi nối bằng khoảng bắc cầu, vẫn giữ riêng phần chỉ chạm', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }, { start: 8, end: 9 }]),
    [{ start: 1, end: 8 }, { start: 8, end: 9 }]
  );
});
