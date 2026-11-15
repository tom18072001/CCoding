'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function setup(promos = [], stock = { A: 4, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 1.005, category: 'x' },
    { sku: 'B', name: 'b', price: 2.675, category: 'x' },
    { sku: 'C', name: 'c', price: 3.33, category: 'y', taxClass: 'reduced' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#2 allocate phần dư lớn nhất; giảm cố định đủ tổng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3]), [1, 4]);
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 5 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 500);
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((n) => freeUnits(n, 2, 1)), [0, 1, 1, 2]);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ tồn kho khớp giỏ', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('C', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 333);
  assert.equal(t.tax, Math.round(333 * 0.05));
});
