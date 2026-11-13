'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents làm tròn half away from zero theo thập phân', () => {
  assert.strictEqual(toCents(1.005), 101);
  assert.strictEqual(toCents(-1.005), -101);
  assert.strictEqual(toCents(2.675), 268);
  assert.strictEqual(toCents(12.34), 1234);
  assert.strictEqual(toCents(0), 0);
});

test('Catalog dùng toCents đúng cho giá', () => {
  const c = new Catalog([{ sku: 'A', name: 'a', price: 1.005, category: 'x' }]);
  assert.strictEqual(c.get('A').priceCents, 101);
});

test('allocate: phần dư lớn nhất, tổng đúng', () => {
  assert.deepStrictEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepStrictEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
  assert.strictEqual(allocate(100, [33.3, 33.3, 33.4]).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(allocate(10, [1, 2]), [3, 7]);
  assert.deepStrictEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepStrictEqual(allocate(1, [1, 1, 1]), [1, 0, 0]);
});
