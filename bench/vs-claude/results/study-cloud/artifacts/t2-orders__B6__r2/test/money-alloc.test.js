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
  assert.equal(toCents(1.004), 100);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(1e-7), 0);
});

test('catalog dùng toCents chính xác', () => {
  assert.equal(new Catalog([{ sku: 'a', price: 1.005 }]).get('a').priceCents, 101);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2, 3]), [17, 33, 50]);
  assert.deepEqual(allocate(5, [0, 1, 1]), [0, 3, 2]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  for (const [t, w] of [[999, [3, 7, 11, 13]], [1, [1, 1, 1]]]) {
    assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
});
