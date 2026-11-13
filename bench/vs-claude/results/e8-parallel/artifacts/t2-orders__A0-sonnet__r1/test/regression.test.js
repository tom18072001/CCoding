'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, PromotionError } = require('../src');

function mk(promos = [], prices = [1, 1, 1], stock = 10) {
  const catalog = new Catalog(prices.map((p, i) => ({ sku: 'S' + i, name: 'x', price: p, category: 'c' })));
  const inv = new Inventory(Object.fromEntries(prices.map((_, i) => ['S' + i, stock])));
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], [5]);
  cart.addItem('S0');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  const c2 = mk([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], [1.005]);
  c2.cart.addItem('S0');
  c2.cart.applyCoupon('M');
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 1, 1, 1]), [2, 1, 1, 1]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }]);
  for (const s of ['S0', 'S1', 'S2']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 300 > 1000 ? 1000 : 300);
  const m = mk([{ code: 'F', type: 'fixed', amount: 10 }], [5, 5, 5]);
  for (const s of ['S0', 'S1', 'S2']) m.cart.addItem(s);
  m.cart.applyCoupon('F');
  assert.equal(computeTotals(m.cart).discount, 1000);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), PromotionError);
});

test('#5 giữ chỗ tồn kho', () => {
  const { cart, inv } = mk([], [1], 4);
  cart.addItem('S0', 2);
  cart.updateQty('S0', 3);
  assert.equal(inv.available('S0'), 1);
  cart.updateQty('S0', 1);
  assert.equal(inv.available('S0'), 3);
  cart.removeItem('S0');
  assert.equal(inv.available('S0'), 4);
});

test('#6 thuế trên giá sau giảm', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], [10]);
  cart.addItem('S0');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
