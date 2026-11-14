'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');

function setup(stock = { MUG: 4 }) {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 10, category: 'home' }]);
  const inv = new Inventory(stock);
  return { catalog, inv, mk: () => new Cart(catalog, inv) };
}

test('kho 4, thêm 2 rồi sửa thành 3 thành công', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 2);
  c.updateQty('MUG', 3);
  assert.equal(inv.reserved.get('MUG'), 3);
  assert.equal(inv.available('MUG'), 1);
});

test('giảm số lượng nhả giữ chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 4);
  c.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
});

test('xóa món nhả giữ chỗ, khách khác mua được', () => {
  const { inv, mk } = setup();
  const a = mk();
  const b = mk();
  a.addItem('MUG', 4);
  assert.throws(() => b.addItem('MUG', 1), { name: 'OutOfStockError' });
  a.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
  b.addItem('MUG', 4);
  assert.equal(inv.available('MUG'), 0);
});

test('updateQty về 0 và clear nhả giữ chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('MUG', 3);
  c.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 4);
  c.addItem('MUG', 2);
  c.clear();
  assert.equal(inv.available('MUG'), 4);
});

test('nhiều giỏ: reserved bằng tổng; bị từ chối thì không đổi', () => {
  const { inv, mk } = setup();
  const a = mk();
  const b = mk();
  a.addItem('MUG', 2);
  b.addItem('MUG', 1);
  assert.throws(() => b.updateQty('MUG', 4), { name: 'OutOfStockError' });
  assert.equal(b.lines.get('MUG'), 1);
  assert.equal(inv.reserved.get('MUG'), 3);
  b.updateQty('MUG', 2);
  assert.equal(inv.reserved.get('MUG'), 4);
  assert.throws(() => a.addItem('MUG', 1));
  assert.equal(inv.reserved.get('MUG'), 4);
});
