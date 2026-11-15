'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'c' }]);
  const inv = new Inventory({ A: stock });
  const mk = () => new Cart(catalog, inv);
  return { inv, mk };
}

test('sửa số lượng 2 -> 3 với kho 4 không báo hết hàng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng trả chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 3);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món trả đủ chỗ cho giỏ khác', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), { name: 'OutOfStockError' });
  c1.removeItem('A');
  assert.equal(inv.available('A'), 4);
  c2.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('qty về 0 trả chỗ và xóa dòng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  assert.equal(c.items().length, 0);
});

test('vượt kho báo lỗi và giữ nguyên trạng thái', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 2);
  c2.addItem('A', 1);
  assert.throws(() => c1.updateQty('A', 4), { name: 'OutOfStockError' });
  assert.equal(c1.lines.get('A'), 2);
  assert.equal(inv.available('A'), 1);
  assert.throws(() => c1.addItem('A', 2), { name: 'OutOfStockError' });
  assert.equal(inv.available('A'), 1);
});

test('nhiều giỏ: giữ chỗ bằng tổng qty; xóa món không có trong giỏ là no-op', () => {
  const { inv, mk } = setup(10);
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 3);
  c2.addItem('A', 4);
  c1.updateQty('A', 5);
  c2.updateQty('A', 2);
  assert.equal(inv.reserved.get('A'), 7);
  c1.removeItem('A');
  c1.removeItem('A');
  assert.equal(inv.reserved.get('A'), 2);
});
