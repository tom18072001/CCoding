'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, OutOfStockError } = require('../src');

function setup(stock = { A: 4 }) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory(stock);
  return { inv, mk: () => new Cart(catalog, inv) };
}

test('kho 4: thêm 2 rồi sửa thành 3 không báo hết hàng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('xóa món giải phóng giữ chỗ cho giỏ khác', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), OutOfStockError);
  c1.removeItem('A');
  assert.equal(inv.reserved.get('A'), 0);
  c2.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('giảm và về 0 giải phóng; add trùng sku cộng dồn đúng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 1);
  c.addItem('A', 2);
  assert.equal(inv.reserved.get('A'), 3);
  c.updateQty('A', 1);
  assert.equal(inv.reserved.get('A'), 1);
  c.updateQty('A', 0);
  assert.equal(inv.reserved.get('A'), 0);
  assert.equal(c.lines.has('A'), false);
});

test('hai giỏ cùng giữ chỗ; thất bại không đổi trạng thái', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 2);
  c2.addItem('A', 1);
  assert.throws(() => c2.updateQty('A', 3), OutOfStockError);
  assert.equal(c2.lines.get('A'), 1);
  assert.throws(() => c2.addItem('A', 2), OutOfStockError);
  assert.equal(c2.lines.get('A'), 1);
  assert.equal(inv.reserved.get('A'), 3);
  c2.updateQty('A', 2);
  assert.equal(inv.reserved.get('A'), 4);
  c1.removeItem('A');
  assert.equal(inv.reserved.get('A'), 2);
});
