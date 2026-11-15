'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

const mk = (promos, stock = { A: 10, B: 10, C: 10 }, price = 1) => {
  const cat = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(cat, inv, promos), inv };
};

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#2 allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F', new Date('2026-01-01'));
  assert.equal(computeTotals(cart).discount, 300);
  const { cart: c2 } = mk([{ code: 'F', type: 'fixed', amount: 1 }], undefined, 10);
  ['A', 'B', 'C'].forEach((s) => c2.addItem(s, 1));
  c2.applyCoupon('F');
  assert.equal(computeTotals(c2).discount, 100);
  const { cart: c3 } = mk([{ code: 'P', type: 'percent', percent: 10 }], undefined, 3.33);
  ['A', 'B', 'C'].forEach((s) => c3.addItem(s, 1));
  c3.applyCoupon('P');
  assert.equal(computeTotals(c3).discount, 100);
});

test('#3 buy X get Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('#4 endsAt inclusive whole day UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0));
});

test('#5 inventory reservation tracks carts', () => {
  const { cart, inv } = mk([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 tax on net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], undefined, 100);
  cart.addItem('A', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
