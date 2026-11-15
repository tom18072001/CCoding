'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(12.34), 1234);
  assert.ok(Object.is(toCents(-0.001), 0));
});

test('Catalog lưu giá 1.005 là 101 xu', () => {
  const c = new Catalog([{ sku: 'A', name: 'A', price: 1.005, category: 'x' }]);
  assert.equal(c.get('A').priceCents, 101);
});

test('allocate: tổng các phần đúng bằng total', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(10, [1, 2, 3]).reduce((a, b) => a + b, 0), 10);
});

test('allocate: phần lẻ lớn nhất được ưu tiên, bằng nhau thì đứng trước', () => {
  assert.deepEqual(allocate(5, [1, 1, 3]), [1, 1, 3]);
  assert.deepEqual(allocate(2, [3, 1, 3]), [1, 0, 1]);
});

test('allocate: số âm và trọng số 0', () => {
  assert.deepEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(10, [0, 5]), [0, 10]);
  assert.deepEqual(allocate(0, [1, 1]), [0, 0]);
});
