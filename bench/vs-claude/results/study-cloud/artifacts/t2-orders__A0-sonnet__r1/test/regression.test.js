'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function setup(promos = [], price = 10) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price, category: 'x' },
    { sku: 'B', name: 'B', price, category: 'x' },
    { sku: 'C', name: 'C', price, category: 'y', taxClass: 'reduced' },
  ]);
  const inv = new Inventory({ A: 4, B: 10, C: 10 });
  return { cart: new Cart(catalog, inv, promos), inv, catalog };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('#1 mã cố định & min subtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005, minSubtotal: 9.995 }]);
  cart.addItem('B', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], 3.34);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 100);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocate(100, [1, 2, 3]).reduce((a, b) => a + b), 100);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('B');
  assert.doesNotThrow(() => cart.applyCoupon('P', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('P', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('P', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho nhất quán', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('B', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1000 + 100);
});
