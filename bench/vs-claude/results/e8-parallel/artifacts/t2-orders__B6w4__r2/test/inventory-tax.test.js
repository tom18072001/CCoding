'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(stock = 4, promos = []) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 10, category: 'home', taxClass: 'standard' }]);
  const inv = new Inventory({ MUG: stock });
  return { cart: new Cart(catalog, inv, promos), inv, catalog };
}

test('sửa số lượng 2→3 khi kho còn 4 thành công, giữ chỗ = 3', () => {
  const { cart, inv } = setup(4);
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 3);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.equal(inv.available('MUG'), 1);
});

test('giảm số lượng nhả chỗ', () => {
  const { cart, inv } = setup(4);
  cart.addItem('MUG', 3);
  cart.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
});

test('updateQty vượt kho vẫn báo lỗi và không đổi giữ chỗ', () => {
  const { cart, inv } = setup(4);
  cart.addItem('MUG', 2);
  assert.throws(() => cart.updateQty('MUG', 5), /Hết hàng/);
  assert.equal(inv.available('MUG'), 2);
  assert.equal(cart.lines.get('MUG'), 2);
});

test('xóa món (và updateQty 0) nhả chỗ cho người khác', () => {
  const { cart, inv, catalog } = setup(4);
  cart.addItem('MUG', 4);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
  const other = new Cart(catalog, inv);
  other.addItem('MUG', 4);
  other.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 4);
});

test('thuế tính trên net khi có mã giảm giá', () => {
  const { cart } = setup(10, [{ code: 'HALF', type: 'percent', percent: 50 }]);
  cart.addItem('MUG', 2); // gross 2000
  cart.applyCoupon('HALF');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.lines[0].tax, 100);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
