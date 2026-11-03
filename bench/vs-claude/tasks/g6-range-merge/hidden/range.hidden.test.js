'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlaps, mergeRanges } = require('../src/range');

const R = (start, end) => ({ start, end });
test('hidden/overlaps chạm đầu mút', () => { assert.equal(overlaps(R(1, 3), R(3, 5)), false); assert.equal(overlaps(R(3, 5), R(1, 3)), false); });
test('hidden/overlaps lồng nhau', () => { assert.equal(overlaps(R(1, 10), R(3, 4)), true); });
test('hidden/merge chồng', () => { assert.deepEqual(mergeRanges([R(5, 8), R(1, 3), R(2, 6)]), [R(1, 8)]); });
test('hidden/merge kề nhau giữ riêng', () => { assert.deepEqual(mergeRanges([R(1, 3), R(3, 5)]), [R(1, 3), R(3, 5)]); });
test('hidden/merge chuỗi', () => { assert.deepEqual(mergeRanges([R(10, 12), R(1, 4), R(3, 5), R(5, 6)]), [R(1, 5), R(5, 6), R(10, 12)]); });
test('hidden/merge lồng', () => { assert.deepEqual(mergeRanges([R(1, 10), R(2, 3)]), [R(1, 10)]); });
test('hidden/merge rỗng', () => { assert.deepEqual(mergeRanges([]), []); });
test('hidden/merge khoảng sai', () => { assert.throws(() => mergeRanges([R(3, 3)]), RangeError); assert.throws(() => mergeRanges([R(5, 1)]), RangeError); });
test('hidden/merge không đổi đầu vào', () => { const x = [R(5, 8), R(1, 6)]; mergeRanges(x); assert.deepEqual(x, [R(5, 8), R(1, 6)]); });
