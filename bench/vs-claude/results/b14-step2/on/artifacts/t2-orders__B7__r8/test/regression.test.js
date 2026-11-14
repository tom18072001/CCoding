'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate } = require('../src');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 10, category: 'x' },
    { sku: 'B', name: 'B', price: 10, category: 'x' },
    { sku: 'C', name: 'C', price: 10, category: 'y' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 4, C: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
});

test('giảm cố định và % khớp tổng', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 300);
});

test('mua 2 tặng 1', () => {
  const free = (n) => {
    const { cart } = setup([{ code: 'B', type: 'bxgy', sku: 'A', buy: 2, free: 1 }], null, { A: 10 });
    cart.addItem('A', n);
    cart.applyCoupon('B');
    return computeTotals(cart).discount / 1000;
  };
  assert.deepEqual([2, 3, 5, 6].map(free), [0, 1, 1, 2]);
});

test('endsAt tính hết ngày UTC', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ tồn kho theo giỏ', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
