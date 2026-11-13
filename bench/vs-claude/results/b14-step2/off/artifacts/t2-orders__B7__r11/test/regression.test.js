'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 3.33) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#2 allocate phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.equal(allocate(7, [3, 3, 1]).reduce((a, b) => a + b), 7);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  for (const promo of [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }]) {
    const { cart } = setup([promo], undefined, 10);
    ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
    cart.applyCoupon(promo.code);
    assert.equal(computeTotals(cart).discount, promo.type === 'fixed' ? 1000 : 300);
  }
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 999); // giảm không vượt tạm tính
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  const { cart } = setup([{ code: 'B21', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 2);
  cart.applyCoupon('B21');
  assert.equal(computeTotals(cart).discount, 0);
});

test('#4 endsAt dùng được tới hết ngày UTC', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo tổng số lượng giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5));
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 100, category: 'x' }]);
  const cart = new Cart(catalog, new Inventory({ A: 5 }), [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
