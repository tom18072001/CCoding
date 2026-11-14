'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate } = require('../src');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 3.33) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
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
  assert.deepEqual(allocate(2, [1, 5, 5]), [0, 1, 1]);
  assert.equal(allocate(7, [3, 3, 1]).reduce((a, b) => a + b), 7);
});

test('tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 15 }], undefined, 4.01);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(1203 * 0.15));
});

test('mua X tặng Y', () => {
  const { cart } = setup([{ code: 'B', type: 'bxgy', sku: 'A', buy: 2, free: 1 }], { A: 20 }, 10);
  const free = (n) => {
    cart.lines.clear();
    cart.lines.set('A', n);
    return computeTotals(cart).discount / 1000;
  };
  cart.addItem('A', 1);
  cart.applyCoupon('B');
  assert.deepEqual([2, 3, 5, 6].map(free), [0, 1, 1, 2]);
});

test('mã dùng được tới hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ tồn kho khớp với giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net', () => {
  const catalog = new Catalog([{ sku: 'M', name: 'M', price: 100, category: 'x' }]);
  const cart = new Cart(catalog, new Inventory({ M: 5 }), [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('M');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
