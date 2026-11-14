'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1 }]);
  const inv = new Inventory({ A: stock });
  return { inv, a: new Cart(catalog, inv), b: new Cart(catalog, inv) };
}

test('kho 4, thêm 2 rồi sửa thành 3: không báo hết hàng, giữ chỗ = 3', () => {
  const { inv, a } = setup();
  a.addItem('A', 2);
  a.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng giải phóng phần chênh', () => {
  const { inv, a } = setup();
  a.addItem('A', 4);
  a.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món giải phóng giữ chỗ cho khách khác; xóa lặp/không tồn tại an toàn', () => {
  const { inv, a, b } = setup();
  a.addItem('A', 4);
  assert.throws(() => b.addItem('A', 1), OutOfStockError);
  a.removeItem('A');
  a.removeItem('A');
  a.removeItem('ZZZ');
  assert.equal(inv.reserved.get('A'), 0);
  b.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('đặt về 0 giải phóng; giữ chỗ bằng tổng các giỏ', () => {
  const { inv, a, b } = setup();
  a.addItem('A', 2);
  b.addItem('A', 1);
  a.updateQty('A', 0);
  assert.equal(inv.reserved.get('A'), 1);
});

test('vượt tồn kho ném lỗi và không đổi trạng thái', () => {
  const { inv, a, b } = setup();
  a.addItem('A', 2);
  b.addItem('A', 1);
  assert.throws(() => a.updateQty('A', 4), OutOfStockError);
  assert.equal(a.lines.get('A'), 2);
  assert.equal(inv.reserved.get('A'), 3);
  assert.throws(() => a.addItem('A', 2), OutOfStockError);
  assert.equal(inv.reserved.get('A'), 3);
  a.updateQty('A', 3);
  assert.equal(inv.available('A'), 0);
});
