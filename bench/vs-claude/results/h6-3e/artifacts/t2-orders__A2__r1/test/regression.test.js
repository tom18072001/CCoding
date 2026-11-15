'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');
const { Inventory } = require('../src/inventory');
const { Cart } = require('../src/cart');
const { computeTotals } = require('../src/checkout');
const { freeUnits } = require('../src/promotions');

const mk = (promos = [], stock = { A: 4, B: 10, C: 10 }, extra = {}) => {
  const cat = new Catalog([
    { sku: 'A', name: 'a', price: 3.33, category: 'x' },
    { sku: 'B', name: 'b', price: 3.33, category: 'x' },
    { sku: 'C', name: 'c', price: 3.34, category: 'y', ...extra },
  ]);
  const inv = new Inventory(stock);
  return { inv, cart: new Cart(cat, inv, promos) };
};

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(new Catalog([{ sku: 'p', price: 1.005 }]).get('p').priceCents, 101);
});

test('#2 allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [333, 333, 334]), [333, 333, 334]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 330);
});

test('#3 buy X get Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('#4 endsAt inclusive of whole day (UTC)', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('B');
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), { name: 'PromotionError' });
});

test('#5 inventory reservations', () => {
  const { inv, cart } = mk();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), { name: 'OutOfStockError' });
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2); cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 tax on net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], undefined, {});
  cart.addItem('B', 3); // gross 999
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, t.lines[0].gross - t.lines[0].discount);
  assert.equal(t.lines[0].tax, Math.round(t.lines[0].net * 0.1));
  assert.equal(t.total, t.lines[0].net + t.lines[0].tax);
});
