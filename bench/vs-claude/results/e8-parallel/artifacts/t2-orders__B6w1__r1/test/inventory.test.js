'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 10, category: 'home' }]);
  const inv = new Inventory({ MUG: stock });
  return { catalog, inv, cart: new Cart(catalog, inv, []) };
}

test('kho 4, thêm 2 rồi sửa thành 3 thì OK', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 3);
  assert.equal(inv.available('MUG'), 1);
  assert.equal(inv.reserved.get('MUG'), 3);
});

test('giảm số lượng 3 -> 1 release phần chênh', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 3);
  cart.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
});

test('xóa món rồi giỏ khác mua được đủ', () => {
  const { catalog, inv, cart } = setup();
  cart.addItem('MUG', 4);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
  const other = new Cart(catalog, inv, []);
  other.addItem('MUG', 4);
  assert.equal(inv.available('MUG'), 0);
});

test('qty = 0 release toàn bộ; removeItem sku không có không release thừa', () => {
  const { catalog, inv, cart } = setup();
  const other = new Cart(catalog, inv, []);
  other.addItem('MUG', 1);
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 0);
  assert.equal(inv.reserved.get('MUG'), 1);
  cart.removeItem('MUG');
  assert.equal(inv.reserved.get('MUG'), 1);
});

test('sửa vượt kho ném lỗi và giữ nguyên trạng thái', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  assert.throws(() => cart.updateQty('MUG', 5), OutOfStockError);
  assert.equal(cart.lines.get('MUG'), 2);
  assert.equal(inv.reserved.get('MUG'), 2);
});

test('hai giỏ dùng chung Inventory', () => {
  const { catalog, inv, cart } = setup();
  const b = new Cart(catalog, inv, []);
  cart.addItem('MUG', 2);
  b.addItem('MUG', 1);
  assert.throws(() => b.updateQty('MUG', 3), OutOfStockError);
  b.updateQty('MUG', 2);
  assert.equal(inv.available('MUG'), 0);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 2);
  assert.equal(inv.reserved.get('MUG'), 2);
});
