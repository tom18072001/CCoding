'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { OutOfStockError } = require('../src/inventory');

function setup(stock = 4) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory({ A: stock });
  return { inv, mk: () => new Cart(catalog, inv) };
}

test('kho 4: add 2 rồi set 3 thành công, giữ chỗ = 3', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('remove giải phóng để giỏ khác mua được', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), OutOfStockError);
  c1.removeItem('A');
  assert.equal(inv.available('A'), 4);
  c2.addItem('A', 4);
  assert.equal(inv.reserved.get('A'), 4);
});

test('set giảm và set về 0 giải phóng phần chênh', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 4);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  assert.equal(c.lines.has('A'), false);
});

test('vượt kho ném OutOfStockError và không đổi trạng thái', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  assert.throws(() => c.updateQty('A', 5), OutOfStockError);
  assert.throws(() => c.addItem('A', 3), OutOfStockError);
  assert.equal(c.lines.get('A'), 2);
  assert.equal(inv.reserved.get('A'), 2);
});
