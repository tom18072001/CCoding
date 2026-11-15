'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src');

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('giá sản phẩm 1.005 → 101 xu', () => {
  const c = new Catalog([{ sku: 'A', name: 'a', price: 1.005 }]);
  assert.equal(c.get('A').priceCents, 101);
});

test('allocate phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.equal(allocate(10, [1, 2, 3]).reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(allocate(5, [1, 1, 1, 1, 0]), [2, 1, 1, 1, 0]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
});
