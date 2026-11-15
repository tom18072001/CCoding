'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { median, summary } = require('../src/stats');

test('hidden/median nhiều chữ số', () => { assert.equal(median([10, 9, 100]), 10); });
test('hidden/median chẵn', () => { assert.equal(median([4, 1, 3, 2]), 2.5); });
test('hidden/median chẵn nhiều chữ số', () => { assert.equal(median([100, 20, 3, 4000]), 60); });
test('hidden/median số âm', () => { assert.equal(median([-5, -10, 0]), -5); });
test('hidden/median không đổi đầu vào', () => { const x = [3, 1, 2]; median(x); assert.deepEqual(x, [3, 1, 2]); });
test('hidden/summary', () => { assert.deepEqual(summary([10, 9, 100, 1]), { count: 4, min: 1, max: 100, mean: 30, median: 9.5 }); });
test('hidden/summary mean làm tròn', () => { assert.equal(summary([1, 2, 2]).mean, 1.67); });
test('hidden/summary không đổi đầu vào', () => { const x = [3, 1, 2]; summary(x); assert.deepEqual(x, [3, 1, 2]); });
test('hidden/summary rỗng', () => { assert.throws(() => summary([]), RangeError); });
