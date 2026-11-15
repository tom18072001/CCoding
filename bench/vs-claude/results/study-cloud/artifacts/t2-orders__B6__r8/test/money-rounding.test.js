'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCents, allocate } = require('../src/money');

test('toCents làm tròn half away from zero', () => {
  assert.strictEqual(toCents(1.005), 101);
  assert.strictEqual(toCents(-1.005), -101);
  assert.strictEqual(toCents(2.675), 268);
  assert.strictEqual(toCents(12.34), 1234);
  assert.strictEqual(toCents(0), 0);
});

test('allocate: giảm cố định 10.00 chia 3 dòng bằng nhau, tổng đúng', () => {
  assert.deepStrictEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
});

test('allocate: tổng các phần luôn bằng total', () => {
  for (const [t, w] of [[1, [1, 1, 1]], [999, [5, 3, 2, 7]], [100, [1, 2, 3]], [7, [0, 1, 1]]]) {
    assert.strictEqual(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
  assert.deepStrictEqual(allocate(7, [0, 1, 1]), [0, 4, 3]);
  assert.deepStrictEqual(allocate(5, [0, 0]), [0, 0]);
});
