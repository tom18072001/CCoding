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
  assert.equal(toCents(0), 0);
  assert.equal(toCents(10), 1000);
});

test('Catalog lưu priceCents đúng', () => {
  const c = new Catalog([{ sku: 'A', price: 1.005 }, { sku: 'B', price: 2.675 }]);
  assert.equal(c.get('A').priceCents, 101);
  assert.equal(c.get('B').priceCents, 268);
});

test('allocate: tổng phần chia bằng total, phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2, 3]), [17, 33, 50]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  const r = allocate(999, [3, 7, 11, 13]);
  assert.equal(r.reduce((a, b) => a + b, 0), 999);
});
