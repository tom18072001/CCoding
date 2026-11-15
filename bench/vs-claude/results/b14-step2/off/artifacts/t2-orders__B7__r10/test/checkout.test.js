'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(promos = []) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const inv = new Inventory({ TEA: 10, MUG: 5 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('tính tiền không mã giảm giá', () => {
  const { cart } = setup();
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 1);
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 2250);
  assert.equal(t.tax, 50 + 125);
  assert.equal(t.total, 2250 + 175);
});

test('giữ chỗ tồn kho khi thêm', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  assert.equal(inv.available('MUG'), 3);
});

test('mã không tồn tại', () => {
  const { cart } = setup();
  assert.throws(() => cart.applyCoupon('NOPE'), /không tồn tại/);
});
