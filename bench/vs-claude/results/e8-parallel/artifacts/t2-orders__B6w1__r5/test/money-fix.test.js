'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('toCents làm tròn half away from zero, không lỗi nhị phân', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(-0.004), 0);
  assert.equal(toCents(1e-7), 0);
});

test('allocate(1000,[1,1,1]) tổng đúng 1000, dư cho phần đứng trước', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
});

test('allocate trọng số khác nhau: phần dư lớn nhất', () => {
  const r = allocate(100, [1, 2, 3]);
  assert.equal(sum(r), 100);
  assert.deepEqual(r, [17, 33, 50]);
  assert.deepEqual(allocate(10, [1, 1, 8]), [1, 1, 8]);
  assert.equal(sum(allocate(999, [5, 3, 7, 1])), 999);
});

test('allocate số âm và biên', () => {
  assert.deepEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(5, [0, 1]), [0, 5]);
  assert.deepEqual(allocate(100, [1]), [100]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
});
