'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(promos, items) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.34, category: 'y', taxClass: 'reduced' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 50, B: 50, C: 50 }), promos);
  for (const [s, q] of items) cart.addItem(s, q);
  return cart;
}

test('thuế tính trên net sau giảm giá', () => {
  const base = computeTotals(setup([], [['A', 10]]));
  assert.equal(base.tax, 333);
  const c = setup([{ code: 'P', type: 'percent', percent: 50 }], [['A', 10]]);
  c.applyCoupon('P');
  const t = computeTotals(c);
  assert.equal(t.lines[0].net, 1665);
  assert.equal(t.lines[0].tax, 167);
  assert.equal(t.total, t.lines[0].net + t.lines[0].tax);
});

test('mã fixed 10.00 chia 3 dòng: tổng giảm đúng 1000 xu', () => {
  const c = setup([{ code: 'F', type: 'fixed', amount: 10 }], [['A', 1], ['B', 1], ['C', 1]]);
  c.applyCoupon('F');
  const t = computeTotals(c);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('mã fixed 1.005 đổi xu half away from zero', () => {
  const c = setup([{ code: 'F', type: 'fixed', amount: 1.005 }], [['A', 1], ['B', 1], ['C', 1]]);
  c.applyCoupon('F');
  assert.equal(computeTotals(c).discount, 101);
});
