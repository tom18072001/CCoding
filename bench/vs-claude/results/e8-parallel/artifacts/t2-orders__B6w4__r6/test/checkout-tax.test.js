'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { lineTax } = require('../src/tax');

function setup(promo) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const cart = new Cart(catalog, new Inventory({ TEA: 100, MUG: 100 }), []);
  cart.addItem('TEA', 4);
  cart.addItem('MUG', 3);
  cart.coupon = promo;
  return cart;
}

function checkTaxOnNet(t) {
  const cls = { TEA: 'reduced', MUG: 'standard' };
  for (const l of t.lines) {
    assert.equal(l.net, l.gross - l.discount);
    assert.equal(l.tax, lineTax(l.net, cls[l.sku]));
  }
  assert.equal(t.tax, t.lines.reduce((a, l) => a + l.tax, 0));
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
}

test('thuế tính trên net với mã %', () => {
  const t = computeTotals(setup({ type: 'percent', percent: 20 }));
  assert.ok(t.discount > 0);
  checkTaxOnNet(t);
});

test('thuế tính trên net với mã cố định; 10.00 giảm đúng 1000 xu', () => {
  const t = computeTotals(setup({ type: 'fixed', amount: 10 }));
  assert.equal(t.discount, 1000);
  checkTaxOnNet(t);
});

test('mã cố định 0.29 giảm đúng 29 xu', () => {
  const t = computeTotals(setup({ type: 'fixed', amount: 0.29 }));
  assert.equal(t.discount, 29);
});

test('thuế tính trên net với mã bxgy', () => {
  const t = computeTotals(setup({ type: 'bxgy', sku: 'TEA', buy: 1, free: 1 }));
  assert.ok(t.discount > 0);
  checkTaxOnNet(t);
});

test('lineTax làm tròn half up', () => {
  assert.equal(lineTax(25, 'standard'), 3);
  assert.equal(lineTax(5, 'reduced'), 0);
  assert.equal(lineTax(10, 'reduced'), 1);
});
