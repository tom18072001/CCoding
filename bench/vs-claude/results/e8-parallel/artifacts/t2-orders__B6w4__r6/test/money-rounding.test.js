'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');

test('toCents làm tròn half away from zero theo giá trị thập phân', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(5), 500);
  assert.equal(toCents(-12.34), -1234);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(-1e-7), 0);
  assert.equal(toCents(1.5e-2), 2);
});

test('toCents vẫn ném TypeError với đầu vào sai', () => {
  assert.throws(() => toCents('1'), TypeError);
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents(Infinity), TypeError);
});

test('allocate chia phần dư, tổng bằng total', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 1]), [50, 50]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  for (const [t, w] of [[101, [3, 5, 7]], [7, [1, 1, 1, 1]], [999, [1, 2, 3]], [1, [0, 1, 1]]]) {
    assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
});

test('allocate: phần lẻ lớn nhất trước, bằng nhau thì đứng trước', () => {
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(1, [0, 1, 1]), [0, 1, 0]);
});

test('allocate với total âm', () => {
  assert.deepEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
});
