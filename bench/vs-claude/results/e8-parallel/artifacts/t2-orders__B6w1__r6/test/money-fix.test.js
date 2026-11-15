'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(-0.001), 0);
});

test('allocate: phần dư lớn nhất, tổng = total', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [1, 1, 1, 1]), [2, 1, 1, 1]);
  assert.deepEqual(allocate(100, [0, 1, 1]), [0, 50, 50]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
});

test('allocate: total âm', () => {
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.equal(allocate(-7, [3, 3, 1]).reduce((a, b) => a + b, 0), -7);
});
