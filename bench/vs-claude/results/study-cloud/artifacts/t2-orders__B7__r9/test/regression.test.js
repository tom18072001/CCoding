'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 1, category: 'x' },
    { sku: 'B', name: 'b', price: 1, category: 'x' },
    { sku: 'C', name: 'c', price: 1, category: 'y' },
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

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(10, [1, 2, 3, 4]), [1, 2, 3, 4]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s, 1);
  cart.catalog.add({ sku: 'A', name: 'a', price: 33.33, category: 'x' });
  cart.catalog.add({ sku: 'B', name: 'b', price: 33.33, category: 'x' });
  cart.catalog.add({ sku: 'C', name: 'c', price: 33.34, category: 'y' });
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.discount, Math.round((t.subtotal * 33) / 100));
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ tồn kho khớp giỏ', () => {
  const { cart, inv } = setup([], { A: 4, B: 1, C: 1 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'H', type: 'percent', percent: 50 }]);
  cart.addItem('A', 10);
  cart.applyCoupon('H');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
