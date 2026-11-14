'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 10, category: 'home' }]);
  const inv = new Inventory({ MUG: stock });
  const mk = () => new Cart(catalog, inv);
  return { inv, mk };
}

test('thêm 2 rồi sửa thành 3 với kho 4 thành công, reserved = 3', () => {
  const { inv, mk } = setup(4);
  const c = mk();
  c.addItem('MUG', 2);
  c.updateQty('MUG', 3);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.equal(inv.available('MUG'), 1);
});

test('giảm số lượng trả lại phần chênh lệch', () => {
  const { inv, mk } = setup(4);
  const c = mk();
  c.addItem('MUG', 4);
  c.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
});

test('xóa món trả lại giữ chỗ cho khách khác', () => {
  const { inv, mk } = setup(4);
  const a = mk();
  const b = mk();
  a.addItem('MUG', 4);
  assert.throws(() => b.addItem('MUG', 1), OutOfStockError);
  a.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
  b.addItem('MUG', 4);
  assert.equal(inv.reserved.get('MUG'), 4);
});

test('updateQty về 0 trả lại giữ chỗ', () => {
  const { inv, mk } = setup(4);
  const c = mk();
  c.addItem('MUG', 3);
  c.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 4);
});

test('hết hàng thật ném OutOfStockError và không ghi nhận một phần', () => {
  const { inv, mk } = setup(4);
  const a = mk();
  const b = mk();
  a.addItem('MUG', 2);
  b.addItem('MUG', 1);
  assert.throws(() => b.updateQty('MUG', 3), OutOfStockError);
  assert.equal(b.lines.get('MUG'), 1);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.throws(() => a.addItem('MUG', 2), OutOfStockError);
  assert.equal(a.lines.get('MUG'), 2);
  assert.equal(inv.reserved.get('MUG'), 3);
});

test('bất biến: reserved = tổng số lượng các giỏ', () => {
  const { inv, mk } = setup(10);
  const a = mk();
  const b = mk();
  a.addItem('MUG', 3);
  b.addItem('MUG', 2);
  a.updateQty('MUG', 5);
  b.updateQty('MUG', 1);
  a.addItem('MUG', 1);
  const sum = a.lines.get('MUG') + b.lines.get('MUG');
  assert.equal(inv.reserved.get('MUG'), sum);
  b.removeItem('MUG');
  assert.equal(inv.reserved.get('MUG'), a.lines.get('MUG'));
});
