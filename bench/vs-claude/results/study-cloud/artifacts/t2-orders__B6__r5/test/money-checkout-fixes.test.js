'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { lineTax } = require('../src/tax');

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(5), 500);
  assert.equal(toCents(-5), -500);
  assert.equal(toCents(0.004), 0);
});

test('allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(0, [3, 4]), [0, 0]);
  const parts = allocate(999, [333, 334, 1, 7]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 999);
});

test('lineTax làm tròn half up', () => {
  assert.equal(lineTax(25, 'reduced'), 1);
  assert.equal(lineTax(15, 'standard'), 2);
  assert.equal(lineTax(0, 'standard'), 0);
});

function build(prices) {
  const skus = prices.map((p, i) => ({ sku: `S${i}`, name: `S${i}`, price: p }));
  const stock = Object.fromEntries(skus.map((s) => [s.sku, 9]));
  const cart = new Cart(new Catalog(skus), new Inventory(stock), []);
  skus.forEach((s) => cart.addItem(s.sku, 1));
  return cart;
}

test('giảm cố định: tổng giảm đúng bằng mã; thuế trên net', () => {
  const cart = build([10, 10, 10]);
  cart.coupon = { type: 'fixed', amount: 10 };
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.tax, 201); // net 667+667+666, thuế làm tròn từng dòng
  assert.equal(t.total, 2000 + 201);
});

test('giảm %: tổng giảm đúng; giá 1.005 → 101 xu', () => {
  const cart = build([1.005, 1, 1]);
  cart.coupon = { type: 'percent', percent: 10 };
  const t = computeTotals(cart);
  assert.equal(t.lines[0].gross, 101);
  assert.equal(t.subtotal, 301);
  assert.equal(t.discount, 30);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 30);
});
