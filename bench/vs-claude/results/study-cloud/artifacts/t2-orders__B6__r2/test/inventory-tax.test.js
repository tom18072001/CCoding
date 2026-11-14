'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(stock = { A: 4 }, promos = []) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' },
    { sku: 'B', name: 'B', price: 20, category: 'y', taxClass: 'reduced' },
  ]);
  const inv = new Inventory(stock);
  return { catalog, inv, promos, mk: () => new Cart(catalog, inv, promos) };
}

test('kho 4: thêm 2 rồi sửa lên 3 được, giữ chỗ = 3', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 2);
  c.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng và xóa món release đúng', () => {
  const { inv, mk } = setup();
  const c = mk();
  c.addItem('A', 4);
  c.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  c.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  c.addItem('A', 2);
  c.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('xóa món thì khách khác mua được; clear release hết', () => {
  const { inv, mk } = setup();
  const c1 = mk();
  const c2 = mk();
  c1.addItem('A', 4);
  assert.throws(() => c2.addItem('A', 1));
  c1.removeItem('A');
  c2.addItem('A', 4);
  c2.clear();
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net sau giảm', () => {
  const { mk } = setup({ A: 10, B: 10 }, [{ code: 'HALF', type: 'percent', percent: 50 }]);
  const c = mk();
  c.addItem('A', 2); // gross 2000
  c.applyCoupon('HALF');
  const t = computeTotals(c);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.lines[0].tax, 100);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
