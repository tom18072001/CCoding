'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps: chạm đầu mút không chồng', () => {
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
});
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng, sắp theo start', () => {
  assert.deepEqual(mergeRanges([{ start: 5, end: 8 }, { start: 1, end: 4 }, { start: 3, end: 6 }]), [{ start: 1, end: 8 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges RangeError khi start >= end', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 4, end: 6 }, { start: 1, end: 5 }];
  const snap = JSON.stringify(input);
  const out = mergeRanges(input);
  assert.equal(JSON.stringify(input), snap);
  assert.notEqual(out[0], input[1]);
});
test('mergeRanges chuỗi chồng bắc cầu chưa sắp xếp', () => {
  assert.deepEqual(
    mergeRanges([{ start: 7, end: 10 }, { start: 1, end: 3 }, { start: 5, end: 8 }, { start: 2, end: 6 }, { start: 20, end: 21 }]),
    [{ start: 1, end: 10 }, { start: 20, end: 21 }]
  );
});
test('mergeRanges start == end ném RangeError dù đứng một mình', () => {
  assert.throws(() => mergeRanges([{ start: 4, end: 4 }]), RangeError);
});
test('mergeRanges không đổi thứ tự mảng và đối tượng đầu vào', () => {
  const a = { start: 5, end: 8 }; const b = { start: 1, end: 6 };
  const input = [a, b];
  mergeRanges(input);
  assert.equal(input[0], a); assert.equal(input[1], b);
  assert.deepEqual(a, { start: 5, end: 8 }); assert.deepEqual(b, { start: 1, end: 6 });
});
