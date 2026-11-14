'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');
const { computeTotals } = require('../src/checkout');

test('toCents làm tròn half away from zero, không sai số float', () => {
  assert.strictEqual(toCents(1.005), 101);
  assert.strictEqual(toCents(-1.005), -101);
  assert.strictEqual(toCents(2.675), 268);
  assert.strictEqual(toCents(12.34), 1234);
  assert.strictEqual(toCents(0), 0);
});

test('Catalog dùng toCents', () => {
  assert.strictEqual(new Catalog([{ sku: 'a', price: 1.005 }]).get('a').priceCents, 101);
});

test('allocate: largest remainder, tổng đúng', () => {
  assert.deepStrictEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepStrictEqual(allocate(100, [1, 2, 3]), [17, 33, 50]);
  assert.deepStrictEqual(allocate(5, [0, 0]), [0, 0]);
  const r = allocate(1001, [3, 7, 11, 13]);
  assert.strictEqual(r.reduce((a, b) => a + b, 0), 1001);
});

test('checkout: giảm cố định 10.00 trên giỏ 3 món tổng đúng 10.00', () => {
  const cat = new Catalog([1, 2, 3].map((n) => ({ sku: 's' + n, price: 10, category: 'c' })));
  const items = () => ['s1', 's2', 's3'].map((sku) => ({ sku, qty: 1, product: cat.get(sku) }));
  const r = computeTotals({ items, coupon: { type: 'fixed', amount: 10 } });
  assert.strictEqual(r.discount, 1000);
  assert.deepStrictEqual(r.lines.map((l) => l.discount), [334, 333, 333]);
});
