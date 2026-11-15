'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 1) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('1. toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('2. allocate phần dư lớn nhất; giảm giá khớp tổng', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.equal(allocate(7, [1, 2, 4]).reduce((a, b) => a + b, 0), 7);
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], undefined, 10);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 300);
});

test('3. mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(4, 1, 1), 2);
});

test('4. endsAt có hiệu lực hết ngày UTC', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('5. giữ chỗ tồn kho khớp tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('6. thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], undefined, 100);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
