'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, OutOfStockError } = require('../src');

function setup(stock = { A: 4, B: 3 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 1, category: 'x' },
    { sku: 'B', name: 'B', price: 2, category: 'x' },
  ]);
  const inv = new Inventory(stock);
  const mk = () => new Cart(catalog, inv, []);
  return { inv, mk };
}

test('kho 4: thêm 2 rồi sửa thành 3 thành công', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
});

test('xóa món nhả chỗ để khách khác mua được', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), OutOfStockError);
  c1.removeItem('A');
  c2.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('updateQty về 0 nhả chỗ; clear nhả toàn bộ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.addItem('B', 3);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  c.clear();
  assert.equal(inv.available('B'), 3);
  assert.equal(c.items().length, 0);
});

test('thao tác thất bại không làm lệch trạng thái', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 3);
  c2.addItem('A', 1);
  assert.throws(() => c1.updateQty('A', 4), OutOfStockError);
  assert.throws(() => c1.addItem('A', 1), OutOfStockError);
  assert.equal(c1.items()[0].qty, 3);
  assert.equal(inv.reserved.get('A'), 4);
  c1.removeItem('Z');
  assert.equal(inv.reserved.get('A'), 4);
});

test('nhiều khách: reserved = tổng số lượng trong các giỏ', () => {
  const { inv, mk } = setup();
  const c1 = mk(), c2 = mk();
  c1.addItem('A', 1); c2.addItem('A', 2); c1.addItem('A', 1);
  c2.updateQty('A', 1); c1.addItem('B', 2); c2.addItem('B', 1);
  const sum = (sku) => [c1, c2].reduce((a, c) => a + (c.lines.get(sku) ?? 0), 0);
  for (const sku of ['A', 'B']) assert.equal(inv.reserved.get(sku), sum(sku));
  c1.clear();
  for (const sku of ['A', 'B']) assert.equal(inv.reserved.get(sku) ?? 0, sum(sku));
});
