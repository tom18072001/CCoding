'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

test('thuế tính trên net sau giảm', () => {
  const catalog = new Catalog([{ sku: 'M', name: 'M', price: 100 }]);
  const cart = new Cart(catalog, new Inventory({ M: 5 }), [{ code: 'T', type: 'percent', percent: 50 }]);
  cart.addItem('M', 1);
  cart.applyCoupon('T');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.lines[0].tax, 500);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
