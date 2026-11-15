'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'TEA', name: 'Trà', price: 5, category: 'drink' }]);
  const inv = new Inventory({ TEA: stock });
  return { catalog, inv, cart: new Cart(catalog, inv) };
}

test('tăng số lượng chỉ giữ phần chênh lệch', () => {
  const { cart, inv } = setup(4);
  cart.addItem('TEA', 2);
  cart.updateQty('TEA', 3);
  assert.equal(inv.reserved.get('TEA'), 3);
  assert.equal(inv.available('TEA'), 1);
});

test('giảm số lượng trả lại phần giữ chỗ', () => {
  const { cart, inv } = setup(4);
  cart.addItem('TEA', 3);
  cart.updateQty('TEA', 1);
  assert.equal(inv.available('TEA'), 3);
});

test('giảm về 0 và xóa món trả lại hết, mua lại được', () => {
  const { cart, inv } = setup(4);
  cart.addItem('TEA', 4);
  cart.updateQty('TEA', 0);
  assert.equal(inv.available('TEA'), 4);
  cart.addItem('TEA', 4);
  cart.removeItem('TEA');
  assert.equal(inv.available('TEA'), 4);
  cart.removeItem('TEA');
  assert.equal(inv.available('TEA'), 4);
  cart.addItem('TEA', 4);
  assert.equal(inv.reserved.get('TEA'), 4);
});

test('vượt tồn kho vẫn ném OutOfStockError và không đổi trạng thái', () => {
  const { cart, inv } = setup(4);
  cart.addItem('TEA', 2);
  assert.throws(() => cart.updateQty('TEA', 5), OutOfStockError);
  assert.equal(cart.lines.get('TEA'), 2);
  assert.equal(inv.available('TEA'), 2);
});

test('hai giỏ cùng kho: reserved bằng tổng các giỏ', () => {
  const { catalog, inv, cart } = setup(4);
  const c2 = new Cart(catalog, inv);
  cart.addItem('TEA', 2);
  c2.addItem('TEA', 2);
  assert.throws(() => c2.updateQty('TEA', 3), OutOfStockError);
  cart.updateQty('TEA', 1);
  c2.updateQty('TEA', 3);
  assert.equal(inv.reserved.get('TEA'), 4);
  c2.removeItem('TEA');
  assert.equal(inv.reserved.get('TEA'), 1);
});
