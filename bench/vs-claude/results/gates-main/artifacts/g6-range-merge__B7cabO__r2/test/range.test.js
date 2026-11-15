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
test('mergeRanges start >= end ném RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 3, end: 1 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 3, end: 6 }, { start: 1, end: 4 }];
  const copy = JSON.parse(JSON.stringify(input));
  mergeRanges(input);
  assert.deepEqual(input, copy);
});
test('mergeRanges chuỗi chạm đầu mút giữ riêng', () => {
  const r = [{ start: 1, end: 3 }, { start: 3, end: 5 }, { start: 5, end: 7 }];
  assert.deepEqual(mergeRanges(r), r);
});
test('mergeRanges chồng bắc cầu nhiều khoảng', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 9 }, { start: 1, end: 3 }, { start: 2, end: 6 }, { start: 8, end: 12 }, { start: 20, end: 21 }]),
    [{ start: 1, end: 12 }, { start: 20, end: 21 }]
  );
});
test('mergeRanges không đổi từng phần tử đầu vào', () => {
  const a = { start: 1, end: 4 }; const b = { start: 3, end: 6 };
  const out = mergeRanges([a, b]);
  assert.deepEqual(a, { start: 1, end: 4 });
  assert.deepEqual(b, { start: 3, end: 6 });
  assert.notEqual(out[0], a);
  assert.notEqual(out[0], b);
});
