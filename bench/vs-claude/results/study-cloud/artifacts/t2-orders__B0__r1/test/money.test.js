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

test('toCents không dính sai số dấu phẩy động, half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(1e21), 1e23);
  assert.throws(() => toCents('1'), TypeError);
  assert.throws(() => toCents(NaN), TypeError);
});

test('allocate chia phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [3, 1, 1]), [3, 1, 1]);
  assert.deepEqual(allocate(2, [1, 3, 3]), [0, 1, 1]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
});
