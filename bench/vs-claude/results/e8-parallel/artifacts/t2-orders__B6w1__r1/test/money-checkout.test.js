'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');

function cartWith(items, promo) {
  const catalog = new Catalog(items.map(([sku, price, taxClass]) => ({ sku, name: sku, price, category: 'c', taxClass })));
  const inv = new Inventory(Object.fromEntries(items.map(([sku]) => [sku, 100])));
  const cart = new Cart(catalog, inv, []);
  cart.coupon = promo ?? null;
  for (const [sku] of items) cart.addItem(sku, 1);
  return cart;
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('allocate: tổng các phần bằng total, phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3]), [1, 4]);
  assert.deepEqual(allocate(10, [0, 1, 1]), [0, 5, 5]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  assert.equal(allocate(777, [3, 5, 7, 11]).reduce((a, b) => a + b, 0), 777);
});

test('mã fixed 10.00 trên giỏ 3 món giảm đúng 1000 xu', () => {
  const cart = cartWith([['A', 10, 'zero'], ['B', 10, 'zero'], ['C', 10, 'zero']], { type: 'fixed', amount: 10 });
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.total, 2000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('mã percent: tổng discount các dòng bằng totalDiscount', () => {
  const cart = cartWith([['A', 3.33, 'zero'], ['B', 3.33, 'zero'], ['C', 3.34, 'zero']], { type: 'percent', percent: 10 });
  const t = computeTotals(cart);
  assert.equal(t.discount, 100);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 100);
});

test('thuế tính trên net sau giảm giá', () => {
  const cart = cartWith([['A', 100, 'standard']], { type: 'percent', percent: 50 });
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
