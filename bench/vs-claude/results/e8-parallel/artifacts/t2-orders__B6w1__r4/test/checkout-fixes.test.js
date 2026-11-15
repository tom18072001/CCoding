'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(promo, taxClass = 'standard') {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.33, category: 'x', taxClass },
    { sku: 'B', name: 'B', price: 3.33, category: 'x', taxClass },
    { sku: 'C', name: 'C', price: 3.34, category: 'x', taxClass },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 9, B: 9, C: 9 }), []);
  for (const s of ['A', 'B', 'C']) cart.addItem(s, 1);
  cart.coupon = promo;
  return cart;
}

test('giảm cố định 10.00 chia 3 dòng: tổng giảm đúng 1000 xu', () => {
  const t = computeTotals(setup({ type: 'fixed', amount: 10 }));
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('giảm % chia 3 dòng: tổng giảm bằng số giảm của mã', () => {
  const t = computeTotals(setup({ type: 'percent', percent: 33 }));
  assert.equal(t.discount, Math.round((1000 * 33) / 100));
});

test('thuế tính trên net sau giảm', () => {
  const t = computeTotals(setup({ type: 'fixed', amount: 5 }));
  const expected = t.lines.reduce((a, l) => a + Math.round(l.net * 0.1), 0);
  assert.equal(t.tax, expected);
  assert.equal(t.total, 500 + t.tax);
});
