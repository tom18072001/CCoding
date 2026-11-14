'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function setup(promos = [], prices = [10, 10, 10], stock = 10) {
  const catalog = new Catalog(prices.map((p, i) => ({ sku: 'S' + i, name: 'x', price: p, category: 'c' })));
  const inv = new Inventory(Object.fromEntries(prices.map((_, i) => ['S' + i, stock])));
  const cart = new Cart(catalog, inv, promos);
  prices.forEach((_, i) => cart.addItem('S' + i, 1));
  return { cart, inv };
}

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.equal(allocate(7, [3, 1, 1]).reduce((a, b) => a + b), 7);
});

test('giảm cố định/% khớp tổng', () => {
  let { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }]);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  ({ cart } = setup([{ code: 'P', type: 'percent', percent: 33 }], [3.33, 3.33, 3.34]));
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(1000 * 0.33));
});

test('mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('hạn dùng tới hết ngày endsAt', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('giữ chỗ kho theo giỏ', () => {
  const { cart, inv } = setup([], [1], 4);
  cart.updateQty('S0', 1);
  cart.addItem('S0', 1);
  cart.updateQty('S0', 3);
  assert.equal(inv.available('S0'), 1);
  cart.updateQty('S0', 1);
  assert.equal(inv.available('S0'), 3);
  cart.removeItem('S0');
  assert.equal(inv.available('S0'), 4);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], [10]);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
