'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

test('overlaps chồng rõ', () => { assert.equal(overlaps({ start: 1, end: 5 }, { start: 3, end: 8 }), true); });
test('overlaps tách rõ', () => { assert.equal(overlaps({ start: 1, end: 2 }, { start: 5, end: 8 }), false); });
test('overlaps chạm đầu mút không chồng', () => {
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
});

test('mergeRanges rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('mergeRanges gộp chồng và sắp theo start', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 9 }, { start: 1, end: 4 }, { start: 3, end: 6 }]),
    [{ start: 1, end: 9 }],
  );
});
test('mergeRanges giữ riêng khoảng chạm đầu mút', () => {
  assert.deepEqual(
    mergeRanges([{ start: 3, end: 5 }, { start: 1, end: 3 }]),
    [{ start: 1, end: 3 }, { start: 3, end: 5 }],
  );
});
test('mergeRanges khoảng chứa trong khoảng khác', () => {
  assert.deepEqual(
    mergeRanges([{ start: 1, end: 10 }, { start: 2, end: 3 }]),
    [{ start: 1, end: 10 }],
  );
});
test('mergeRanges start >= end ném RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 2, end: 2 }]), RangeError);
  assert.throws(() => mergeRanges([{ start: 1, end: 2 }, { start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào', () => {
  const input = [{ start: 3, end: 6 }, { start: 1, end: 4 }];
  const snapshot = JSON.parse(JSON.stringify(input));
  const out = mergeRanges(input);
  assert.deepEqual(input, snapshot);
  assert.notEqual(out[0], input[0]);
  assert.notEqual(out[0], input[1]);
});
test('mergeRanges trùng nhau hoàn toàn', () => {
  assert.deepEqual(
    mergeRanges([{ start: 1, end: 4 }, { start: 1, end: 4 }]),
    [{ start: 1, end: 4 }],
  );
});
test('mergeRanges một phần tử trả bản sao', () => {
  const input = [{ start: 1, end: 2 }];
  const out = mergeRanges(input);
  assert.deepEqual(out, [{ start: 1, end: 2 }]);
  assert.notEqual(out, input);
  assert.notEqual(out[0], input[0]);
});
test('mergeRanges start > end đơn lẻ ném RangeError', () => {
  assert.throws(() => mergeRanges([{ start: 5, end: 3 }]), RangeError);
});
test('mergeRanges không đổi đầu vào khi ném lỗi', () => {
  const input = [{ start: 9, end: 10 }, { start: 1, end: 3 }, { start: 4, end: 4 }];
  const snapshot = JSON.parse(JSON.stringify(input));
  assert.throws(() => mergeRanges(input), RangeError);
  assert.deepEqual(input, snapshot);
});
test('mergeRanges chuỗi chạm đầu mút xen chồng', () => {
  assert.deepEqual(
    mergeRanges([{ start: 5, end: 7 }, { start: 1, end: 3 }, { start: 2, end: 5 }]),
    [{ start: 1, end: 5 }, { start: 5, end: 7 }],
  );
});
