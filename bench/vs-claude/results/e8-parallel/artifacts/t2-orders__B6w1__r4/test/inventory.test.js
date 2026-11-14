'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1 }]);
  const inv = new Inventory({ A: stock });
  return { catalog, inv, cart: new Cart(catalog, inv) };
}

test('kho 4: thêm 2 rồi sửa thành 3 được, giữ chỗ = 3', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng nhả giữ chỗ; vượt kho thì báo và giữ nguyên', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 3);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), { name: 'OutOfStockError' });
  assert.equal(cart.lines.get('A'), 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món (removeItem, updateQty 0) nhả giữ chỗ', () => {
  const { catalog, inv, cart } = setup();
  cart.addItem('A', 2);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  new Cart(catalog, inv).addItem('A', 4);
});

test('giữ chỗ luôn bằng tổng số lượng các giỏ', () => {
  const { catalog, inv, cart } = setup(10);
  const c2 = new Cart(catalog, inv);
  cart.addItem('A', 2);
  c2.addItem('A', 3);
  cart.updateQty('A', 4);
  c2.removeItem('A');
  assert.equal(inv.reserved.get('A'), 4);
});
