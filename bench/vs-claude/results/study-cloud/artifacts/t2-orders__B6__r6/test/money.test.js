'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, formatMoney, allocate } = require('../src/money');

test('toCents cơ bản', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
});

test('allocate chia đều', () => {
  assert.deepEqual(allocate(100, [1, 1]), [50, 50]);
});

test('toCents làm tròn half away from zero, không lỗi nhị phân', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99), 1999);
});

test('allocate: tổng các phần luôn bằng total (largest remainder)', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocate(100, [50, 30, 20]), [50, 30, 20]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  const r = allocate(1001, [33, 33, 34]);
  assert.equal(r.reduce((a, b) => a + b, 0), 1001);
  assert.deepEqual(allocate(2, [1, 5, 5]), [0, 1, 1]);
});
