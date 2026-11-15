'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(coupon = null) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' },
    { sku: 'B', name: 'B', price: 20, category: 'y', taxClass: 'reduced' },
    { sku: 'C', name: 'C', price: 5, category: 'y', taxClass: 'zero' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 10, B: 10, C: 10 }), []);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.coupon = coupon;
  return cart;
}

test('không mã: thuế tính trên gross như cũ', () => {
  const t = computeTotals(setup());
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 100 + 100);
  assert.equal(t.total, 3000 + 200);
});

test('mã %: thuế từng dòng tính trên net', () => {
  const t = computeTotals(setup({ type: 'percent', percent: 10 }));
  assert.equal(t.discount, 300);
  assert.deepEqual(t.lines.map((l) => [l.discount, l.net, l.tax]), [[100, 900, 90], [200, 1800, 90]]);
  assert.equal(t.tax, 180);
  assert.equal(t.total, 2700 + 180);
});

test('mã cố định: tổng giảm các dòng khớp, thuế trên net', () => {
  const t = computeTotals(setup({ type: 'fixed', amount: 3 }));
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 300);
  assert.equal(t.discount, 300);
  assert.equal(t.tax, 180);
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('thuế suất khác nhau, gồm dòng thuế 0', () => {
  const cart = setup({ type: 'percent', percent: 50 });
  cart.addItem('C', 2);
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.tax), [50, 50, 0]);
  assert.equal(t.total, t.subtotal - t.discount + t.tax);
});
