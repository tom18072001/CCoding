'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chạm đầu mút → false', () => { assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false); });
test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp xếp', () => {
  assert.deepEqual(mergeRanges([{ start: 6, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 7 }]), [{ start: 1, end: 9 }]);
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]), [{ start: 1, end: 3 }, { start: 3, end: 5 }]);
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]), [{ start: 1, end: 10 }]);
});
test('mergeRanges start >= end → RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 3, end: 6 }, { start: 1, end: 4 }];
  const snapshot = JSON.parse(JSON.stringify(input));
  mergeRanges(input);
  assert.deepEqual(input, snapshot);
});
test('mergeRanges trả mảng và đối tượng mới, không dùng lại đầu vào', () => {
  const a = { start: 1, end: 3 };
  const b = { start: 2, end: 5 };
  const c = { start: 7, end: 9 };
  const input = [a, b, c];
  const out = mergeRanges(input);
  assert.notEqual(out, input);
  for (const r of out) assert.ok(!input.includes(r));
  out[0].end = 100;
  assert.deepEqual(a, { start: 1, end: 3 });
  assert.deepEqual(b, { start: 2, end: 5 });
});

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
