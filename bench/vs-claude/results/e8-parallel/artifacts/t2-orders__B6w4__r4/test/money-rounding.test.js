'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

test('toCents làm tròn half away from zero chính xác', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(12.34), 1234);
});

test('Catalog lưu giá 1.005 thành 101 xu', () => {
  assert.equal(new Catalog([{ sku: 'A', price: 1.005 }]).get('A').priceCents, 101);
});

test('allocate: tổng các phần đúng bằng total, phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2]), [33, 67]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

function cartWith(coupon) {
  const catalog = new Catalog([
    { sku: 'A', price: 1, category: 'x' },
    { sku: 'B', price: 1, category: 'x' },
    { sku: 'C', price: 1, category: 'x' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 9, B: 9, C: 9 }), []);
  for (const s of ['A', 'B', 'C']) cart.addItem(s, 1);
  cart.coupon = coupon;
  return computeTotals(cart);
}

test('mã cố định chia 3 dòng đủ tổng giảm', () => {
  const t = cartWith({ type: 'fixed', amount: 0.1 });
  assert.equal(t.discount, 10);
  assert.deepEqual(t.lines.map((l) => l.discount), [4, 3, 3]);
  assert.equal(cartWith({ type: 'fixed', amount: 1.005 }).discount, 101);
});

test('mã % chia đủ tổng giảm', () => {
  assert.equal(cartWith({ type: 'percent', percent: 33 }).discount, 99);
  assert.equal(cartWith({ type: 'percent', percent: 10 }).discount, 30);
});
