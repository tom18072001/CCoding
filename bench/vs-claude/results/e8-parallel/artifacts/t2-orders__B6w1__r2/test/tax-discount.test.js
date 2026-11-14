'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { lineTax } = require('../src/tax');

const CLASSES = ['reduced', 'standard']; // TEA, MUG

function setup() {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const promos = [
    { code: 'P20', type: 'percent', percent: 20 },
    { code: 'F5', type: 'fixed', amount: 5 },
  ];
  const cart = new Cart(catalog, new Inventory({ TEA: 10, MUG: 10 }), promos);
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 3);
  return cart;
}

function check(t) {
  let net = 0;
  let tax = 0;
  t.lines.forEach((l, i) => {
    assert.equal(l.net, l.gross - l.discount);
    assert.equal(l.tax, lineTax(l.net, CLASSES[i]));
    net += l.net;
    tax += l.tax;
  });
  assert.equal(t.tax, tax);
  assert.equal(t.total, net + tax);
  assert.equal(t.total, t.subtotal - t.discount + t.tax);
}

test('mã giảm %: thuế tính trên net', () => {
  const cart = setup();
  cart.applyCoupon('P20');
  const t = computeTotals(cart);
  assert.ok(t.discount > 0);
  check(t);
  assert.ok(t.tax < lineTax(1000, 'reduced') + lineTax(3750, 'standard'));
});

test('mã giảm cố định: thuế tính trên net', () => {
  const cart = setup();
  cart.applyCoupon('F5');
  const t = computeTotals(cart);
  assert.equal(t.discount, 500);
  check(t);
});

test('không mã giảm: thuế như cũ', () => {
  const t = computeTotals(setup());
  assert.equal(t.discount, 0);
  assert.equal(t.tax, lineTax(1000, 'reduced') + lineTax(3750, 'standard'));
  check(t);
});
