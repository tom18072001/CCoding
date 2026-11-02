'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory({ A: stock });
  const mk = () => new Cart(catalog, inv);
  return { inv, mk };
}
const sum = (carts) => carts.reduce((a, c) => a + (c.lines.get('A') ?? 0), 0);

test('kho 4: thêm 2 rồi sửa thành 3 không báo hết hàng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng nhả chỗ; về 0 xóa dòng và nhả hết', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 4);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  assert.equal(c.lines.has('A'), false);
});

test('xóa món nhả chỗ để giỏ khác mua được', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), OutOfStockError);
  c1.removeItem('A');
  c2.addItem('A', 4);
  assert.equal(inv.reserved.get('A'), 4);
});

test('thao tác thất bại không rò rỉ giữ chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  assert.throws(() => c.updateQty('A', 9), OutOfStockError);
  assert.throws(() => c.addItem('A', 9), OutOfStockError);
  assert.equal(inv.reserved.get('A'), 2);
  assert.equal(c.lines.get('A'), 2);
  c.removeItem('A');
  c.removeItem('A');
  assert.equal(inv.reserved.get('A'), 0);
});

test('bất biến: reserved = tổng qty các giỏ', () => {
  const { inv, mk } = setup(10);
  const cs = [mk(), mk()];
  cs[0].addItem('A', 3);
  cs[1].addItem('A', 2);
  cs[0].addItem('A', 1);
  cs[1].updateQty('A', 5);
  cs[0].updateQty('A', 2);
  assert.equal(inv.reserved.get('A'), sum(cs));
  cs[1].removeItem('A');
  assert.equal(inv.reserved.get('A'), sum(cs));
});
