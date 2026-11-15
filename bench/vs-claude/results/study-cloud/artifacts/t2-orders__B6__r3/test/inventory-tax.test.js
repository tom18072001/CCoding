'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(stock = { TEA: 4, MUG: 5 }, promos = []) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'standard' },
    { sku: 'MUG', name: 'Cốc', price: 10, category: 'home', taxClass: 'standard' },
  ]);
  const inv = new Inventory(stock);
  return { catalog, inv, cart: new Cart(catalog, inv, promos) };
}

test('thêm 2 rồi sửa thành 3 với kho 4 thành công, giữ chỗ = 3', () => {
  const { cart, inv } = setup();
  cart.addItem('TEA', 2);
  cart.updateQty('TEA', 3);
  assert.equal(inv.reserved.get('TEA'), 3);
  assert.equal(inv.available('TEA'), 1);
});

test('sửa giảm số lượng nhả phần chênh', () => {
  const { cart, inv } = setup();
  cart.addItem('TEA', 4);
  cart.updateQty('TEA', 1);
  assert.equal(inv.available('TEA'), 3);
});

test('sửa vượt kho thất bại thì giữ chỗ không đổi', () => {
  const { cart, inv } = setup();
  cart.addItem('TEA', 2);
  assert.throws(() => cart.updateQty('TEA', 5), { name: 'OutOfStockError' });
  assert.equal(inv.reserved.get('TEA'), 2);
  assert.equal(cart.lines.get('TEA'), 2);
});

test('xóa món nhả giữ chỗ để khách khác mua được', () => {
  const { catalog, inv, cart } = setup();
  const other = new Cart(catalog, inv);
  cart.addItem('TEA', 4);
  assert.throws(() => other.addItem('TEA', 1), { name: 'OutOfStockError' });
  cart.removeItem('TEA');
  other.addItem('TEA', 4);
  assert.equal(inv.available('TEA'), 0);
});

test('updateQty về 0 nhả giữ chỗ; xóa món không có trong giỏ không đổi gì', () => {
  const { cart, inv } = setup();
  cart.addItem('TEA', 3);
  cart.updateQty('TEA', 0);
  assert.equal(inv.available('TEA'), 4);
  cart.removeItem('TEA');
  assert.equal(inv.available('TEA'), 4);
});

test('thuế tính trên net khi có mã giảm giá', () => {
  const promo = { code: 'TEN', type: 'percent', percent: 50 };
  const a = setup({ TEA: 10, MUG: 10 }, [promo]);
  a.cart.addItem('MUG', 2); // gross 2000
  const noCode = computeTotals(a.cart);
  assert.equal(noCode.tax, 200);
  a.cart.applyCoupon('TEN');
  const t = computeTotals(a.cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
