'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function mk(promos, prices = [10, 10, 10], stock = 100) {
  const catalog = new Catalog(prices.map((p, i) => ({ sku: 'S' + i, name: 'x', price: p, category: 'c' })));
  const inv = new Inventory(Object.fromEntries(prices.map((_, i) => ['S' + i, stock])));
  const cart = new Cart(catalog, inv, promos);
  prices.forEach((_, i) => cart.addItem('S' + i, 1));
  return { cart, inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.29), 29);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005, minSubtotal: 29.995 }], [10, 10, 10]);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(0, [1, 1]), [0, 0]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const a = mk([{ code: 'F', type: 'fixed', amount: 10 }]);
  a.cart.applyCoupon('F');
  assert.equal(computeTotals(a.cart).discount, 1000);
  const b = mk([{ code: 'P', type: 'percent', percent: 10 }], [3.33, 3.33, 3.34]);
  b.cart.applyCoupon('P');
  assert.equal(computeTotals(b.cart).discount, 100);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo giỏ', () => {
  const { cart, inv } = mk([], [5], 4);
  cart.updateQty('S0', 3);
  assert.equal(inv.available('S0'), 1);
  cart.updateQty('S0', 2);
  assert.equal(inv.available('S0'), 2);
  cart.removeItem('S0');
  assert.equal(inv.available('S0'), 4);
  cart.addItem('S0', 2);
  cart.updateQty('S0', 3);
  assert.equal(inv.available('S0'), 1);
  cart.updateQty('S0', 0);
  assert.equal(inv.available('S0'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], [10]);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 500 + 50);
});
