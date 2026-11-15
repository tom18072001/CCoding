'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, OutOfStockError } = require('../src');

function setup(stock = { TEA: 4 }) {
  const catalog = new Catalog([{ sku: 'TEA', name: 'Trà', price: 5, category: 'drink' }]);
  const inv = new Inventory(stock);
  return { catalog, inv, mk: () => new Cart(catalog, inv) };
}

test('add 2 rồi set 3 với tồn 4 không báo hết hàng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('TEA', 2);
  c.updateQty('TEA', 3);
  assert.equal(inv.reserved.get('TEA'), 3);
  assert.equal(inv.available('TEA'), 1);
  c.updateQty('TEA', 1);
  assert.equal(inv.reserved.get('TEA'), 1);
});

test('xóa món giải phóng giữ chỗ cho người khác', () => {
  const { inv, mk } = setup();
  const a = mk(), b = mk();
  a.addItem('TEA', 4);
  assert.throws(() => b.addItem('TEA', 1), OutOfStockError);
  a.removeItem('TEA');
  assert.equal(inv.available('TEA'), 4);
  b.addItem('TEA', 4);
  a.removeItem('TEA'); // xóa lại không ảnh hưởng
  assert.equal(inv.reserved.get('TEA'), 4);
  b.updateQty('TEA', 0);
  assert.equal(inv.available('TEA'), 4);
});

test('nhiều giỏ chung kho: giữ chỗ bằng tổng các giỏ', () => {
  const { inv, mk } = setup();
  const a = mk(), b = mk();
  a.addItem('TEA', 1);
  b.addItem('TEA', 2);
  a.updateQty('TEA', 2);
  assert.equal(inv.reserved.get('TEA'), 4);
  assert.throws(() => b.updateQty('TEA', 3), OutOfStockError);
  assert.equal(b.lines.get('TEA'), 2);
  assert.equal(inv.reserved.get('TEA'), 4);
});

test('lỗi không làm rò rỉ giữ chỗ hay đổi giỏ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('TEA', 3);
  assert.throws(() => c.addItem('TEA', 2), OutOfStockError);
  assert.throws(() => c.updateQty('TEA', 5), OutOfStockError);
  assert.equal(c.lines.get('TEA'), 3);
  assert.equal(inv.reserved.get('TEA'), 3);
  c.updateQty('TEA', 4);
  assert.equal(inv.available('TEA'), 0);
});
