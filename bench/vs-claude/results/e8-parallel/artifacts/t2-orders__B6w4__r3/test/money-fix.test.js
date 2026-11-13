'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents làm tròn half away from zero', () => {
  assert.strictEqual(toCents(1.005), 101);
  assert.strictEqual(toCents(-1.005), -101);
  assert.strictEqual(toCents(2.675), 268);
  assert.strictEqual(toCents(12.34), 1234);
  assert.strictEqual(toCents(0), 0);
  assert.ok(!Object.is(toCents(-0.001), -0));
});

test('Catalog dùng toCents đúng', () => {
  const c = new Catalog([{ sku: 'A', name: 'a', price: 1.005, category: 'x' }]);
  assert.strictEqual(c.get('A').priceCents, 101);
});

test('allocate: phần dư lớn nhất, tổng đúng bằng total', () => {
  assert.deepStrictEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepStrictEqual(allocate(100, [1, 2, 3]), [17, 33, 50]);
  assert.deepStrictEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepStrictEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepStrictEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
});

test('allocate: phần dư thuộc phần lẻ lớn nhất', () => {
  assert.deepStrictEqual(allocate(10, [1, 1, 8]), [1, 1, 8]);
  assert.deepStrictEqual(allocate(10, [5, 3, 2, 0]), [5, 3, 2, 0]);
  assert.deepStrictEqual(allocate(1, [1, 3]), [0, 1]);
  assert.deepStrictEqual(allocate(7, [3, 3, 1]), [3, 3, 1]);
});
