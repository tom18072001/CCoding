'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(stock = 4, promos = []) {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' }]);
  const inv = new Inventory({ A: stock });
  return { catalog, inv, mk: () => new Cart(catalog, inv, promos) };
}

test('sửa số lượng 2→3 khi kho 4 không đếm đôi', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng trả lại giữ chỗ', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 4);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('xóa món trả lại giữ chỗ cho khách khác', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1), { name: 'OutOfStockError' });
  c1.removeItem('A');
  c2.addItem('A', 4);
  assert.equal(inv.reserved.get('A'), 4);
});

test('tăng số lượng vượt phần của giỏ khác bị từ chối, giữ nguyên trạng thái', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 2);
  c2.addItem('A', 1);
  assert.throws(() => c2.updateQty('A', 3), { name: 'OutOfStockError' });
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(c2.lines.get('A'), 1);
});

test('thuế tính trên net sau giảm', () => {
  const { mk } = setup(10, [{ code: 'T', type: 'fixed', amount: 10 }]);
  const c = mk();
  c.addItem('A', 2);
  c.applyCoupon('T');
  const t = computeTotals(c);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
