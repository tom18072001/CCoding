'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');

function setup() {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1 }]);
  const inv = new Inventory({ A: 4 });
  return { inv, cart: new Cart(catalog, inv), mk: () => new Cart(catalog, inv) };
}

test('thêm 2 rồi sửa thành 3 khi kho còn 4 thì thành công', () => {
  const { inv, cart } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng trả lại giữ chỗ', () => {
  const { inv, cart } = setup();
  cart.addItem('A', 4);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món (kể cả updateQty 0) trả lại giữ chỗ cho khách khác', () => {
  const { inv, cart, mk } = setup();
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  const c2 = mk();
  c2.addItem('A', 4);
  c2.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A'); // xóa lần hai không trả thừa
  assert.equal(inv.available('A'), 4);
});

test('sửa vượt tồn kho vẫn báo hết hàng và giữ nguyên giỏ', () => {
  const { inv, cart } = setup();
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(cart.lines.get('A'), 2);
  assert.equal(inv.available('A'), 2);
});
