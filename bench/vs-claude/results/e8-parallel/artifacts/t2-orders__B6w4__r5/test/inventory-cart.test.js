'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, OutOfStockError } = require('../src');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' }]);
  const inv = new Inventory({ MUG: stock });
  const mk = () => new Cart(catalog, inv);
  return { inv, mk };
}

test('còn 4, thêm 2 rồi sửa thành 3 thì OK', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 2);
  c.updateQty('MUG', 3);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.equal(inv.available('MUG'), 1);
});

test('sửa thành 5 thì lỗi và giữ chỗ không đổi', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 2);
  assert.throws(() => c.updateQty('MUG', 5), OutOfStockError);
  assert.equal(inv.reserved.get('MUG'), 2);
  assert.equal(c.lines.get('MUG'), 2);
});

test('giảm số lượng và về 0 thì trả giữ chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 4);
  c.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
  c.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 4);
});

test('xóa món thì khách khác mua được; clear trả hết', () => {
  const { inv, mk } = setup();
  const a = mk();
  const b = mk();
  a.addItem('MUG', 4);
  assert.throws(() => b.addItem('MUG', 1), OutOfStockError);
  a.removeItem('MUG');
  b.addItem('MUG', 4);
  b.clear();
  assert.equal(inv.available('MUG'), 4);
});

test('hai giỏ cùng giữ chỗ: tổng khớp', () => {
  const { inv, mk } = setup();
  const a = mk();
  const b = mk();
  a.addItem('MUG', 1);
  b.addItem('MUG', 2);
  a.updateQty('MUG', 2);
  assert.equal(inv.reserved.get('MUG'), 4);
  assert.throws(() => b.updateQty('MUG', 3), OutOfStockError);
  assert.equal(inv.reserved.get('MUG'), 4);
});
