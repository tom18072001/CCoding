'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, OutOfStockError } = require('../src');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' }]);
  const inv = new Inventory({ MUG: stock });
  return { inv, a: new Cart(catalog, inv), b: new Cart(catalog, inv) };
}

test('thêm 2 rồi sửa thành 3 khi kho 4: không báo hết hàng, giữ chỗ = 3', () => {
  const { a, inv } = setup();
  a.addItem('MUG', 2);
  a.updateQty('MUG', 3);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.equal(inv.available('MUG'), 1);
});

test('giảm số lượng nhả giữ chỗ', () => {
  const { a, b, inv } = setup();
  a.addItem('MUG', 4);
  a.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
  b.addItem('MUG', 3);
});

test('xóa món nhả giữ chỗ cho khách khác', () => {
  const { a, b, inv } = setup();
  a.addItem('MUG', 4);
  assert.throws(() => b.addItem('MUG', 1), OutOfStockError);
  a.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
  b.addItem('MUG', 4);
});

test('updateQty về 0 nhả giữ chỗ; xóa lần hai không nhả thừa', () => {
  const { a, b, inv } = setup();
  a.addItem('MUG', 2);
  b.addItem('MUG', 1);
  a.updateQty('MUG', 0);
  a.removeItem('MUG');
  assert.equal(inv.reserved.get('MUG'), 1);
});

test('tăng vượt kho báo lỗi và không đổi giữ chỗ', () => {
  const { a, inv } = setup();
  a.addItem('MUG', 2);
  assert.throws(() => a.updateQty('MUG', 5), OutOfStockError);
  assert.equal(inv.reserved.get('MUG'), 2);
  assert.equal(a.lines.get('MUG'), 2);
});
