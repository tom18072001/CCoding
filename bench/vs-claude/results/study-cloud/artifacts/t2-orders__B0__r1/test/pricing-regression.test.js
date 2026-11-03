'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { lineTax } = require('../src/tax');

function setup(items) {
  return new Cart(new Catalog(items), new Inventory({ A: 99, B: 99, C: 99 }), []);
}
const three = [
  { sku: 'A', name: 'A', price: 3.33, category: 'x', taxClass: 'reduced' },
  { sku: 'B', name: 'B', price: 3.33, category: 'x' },
  { sku: 'C', name: 'C', price: 3.34, category: 'x' },
];
const sum = (t, k) => t.lines.reduce((a, l) => a + l[k], 0);
const fill = (cart) => ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));

test('lỗi 1: catalog price 1.005 -> 101 xu', () => {
  const c = new Catalog([{ sku: 'A', name: 'A', price: 1.005, category: 'x' }]);
  assert.equal(c.get('A').priceCents, 101);
});

test('lỗi 1: mã fixed 1.005 giảm 101 xu', () => {
  const cart = setup([{ sku: 'A', name: 'A', price: 10, category: 'x' }]);
  cart.addItem('A', 1);
  cart.coupon = { type: 'fixed', amount: 1.005 };
  assert.equal(computeTotals(cart).discount, 101);
});

test('lỗi 2: fixed 10.00 chia 3 dòng, Σ dòng = 1000', () => {
  const cart = setup(three);
  fill(cart);
  cart.coupon = { type: 'fixed', amount: 10 };
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(sum(t, 'discount'), 1000);
});

test('lỗi 2: percent chia 3 dòng, Σ dòng = round(subtotal*percent/100)', () => {
  const cart = setup(three);
  fill(cart);
  cart.coupon = { type: 'percent', percent: 33 };
  const t = computeTotals(cart);
  const expected = Math.round((t.subtotal * 33) / 100);
  assert.equal(t.discount, expected);
  assert.equal(sum(t, 'discount'), expected);
});

test('lỗi 6: thuế tính trên net khi có mã giảm', () => {
  const cart = setup([{ sku: 'A', name: 'A', price: 20, category: 'x', taxClass: 'reduced' }]);
  cart.addItem('A', 1);
  cart.coupon = { type: 'fixed', amount: 5 };
  const t = computeTotals(cart);
  assert.equal(t.lines[0].tax, lineTax(t.lines[0].net, 'reduced'));
  assert.notEqual(t.lines[0].tax, lineTax(t.lines[0].gross, 'reduced'));
  assert.equal(t.total, sum(t, 'net') + sum(t, 'tax'));
});
