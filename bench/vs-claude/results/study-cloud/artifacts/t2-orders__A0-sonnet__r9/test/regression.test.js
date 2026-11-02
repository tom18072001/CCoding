'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

const mk = (promos = [], stock = { A: 4, B: 10, C: 10 }, price = { A: 3.33, B: 3.33, C: 3.34 }) => {
  const cat = new Catalog(Object.keys(price).map((sku) => ({ sku, name: sku, price: price[sku], category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(cat, inv, promos), inv };
};

test('1: toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('2: allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [333, 333, 334]), [333, 333, 334]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
});

test('2: giảm cố định / % tổng đúng', () => {
  let { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  ({ cart } = mk([{ code: 'P', type: 'percent', percent: 10 }]));
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 100);
});

test('3: mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('4: endsAt hết ngày UTC', () => {
  const p = { code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), { name: 'PromotionError' });
});

test('5: giữ chỗ tồn kho', () => {
  const { cart, inv } = mk();
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

test('6: thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], { B: 5 }, { B: 10 });
  cart.addItem('B', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
