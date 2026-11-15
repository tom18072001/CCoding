'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.004), 0);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(0), 0);
});

test('allocate: tổng các phần đúng bằng total, phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2, 3]), [17, 33, 50]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

function totalsWith(promo) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.34, category: 'x' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 5, B: 5, C: 5 }), [promo]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  return { cart, totals: () => computeTotals(cart) };
}

test('mã giảm cố định 10.00 chia 3 dòng: tổng giảm đúng 1000 xu', () => {
  const { cart, totals } = totalsWith({ code: 'FIX', type: 'fixed', amount: 10 });
  cart.applyCoupon('FIX');
  assert.equal(totals().discount, 1000);
});

test('mã giảm % : tổng giảm của các dòng khớp số giảm của mã', () => {
  const { cart, totals } = totalsWith({ code: 'PCT', type: 'percent', percent: 15 });
  cart.applyCoupon('PCT');
  const t = totals();
  assert.equal(t.discount, Math.round((t.subtotal * 15) / 100));
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), t.discount);
});
