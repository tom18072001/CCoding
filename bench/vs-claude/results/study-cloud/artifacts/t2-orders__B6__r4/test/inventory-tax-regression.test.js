'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(promos = [], stock = 4) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' },
  ]);
  const inv = new Inventory({ A: stock });
  return { inv, mk: () => new Cart(catalog, inv, promos), cart: new Cart(catalog, inv, promos) };
}

test('sửa số lượng 2 -> 3 khi kho 4 thành công, giữ chỗ = 3', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng nhả chỗ; vượt kho vẫn báo lỗi và không đổi', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 4);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(cart.lines.get('A'), 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món và updateQty 0 nhả chỗ cho giỏ khác', () => {
  const { cart, mk, inv } = setup();
  const other = mk();
  cart.addItem('A', 4);
  assert.throws(() => other.addItem('A', 1));
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  other.addItem('A', 2);
  other.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A'); // xóa món không có: không đổi
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net sau giảm', () => {
  const { cart } = setup([{ code: 'P10', type: 'percent', percent: 50 }]);
  cart.addItem('A', 2); // gross 2000
  cart.applyCoupon('P10');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.lines[0].tax, 100);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
