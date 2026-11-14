'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function mk(promos = [], stock = { A: 4, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 1, category: 'x' },
    { sku: 'B', name: 'b', price: 1, category: 'x' },
    { sku: 'C', name: 'c', price: 1, category: 'y', taxClass: 'reduced' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('mã giảm cố định / % cộng đúng tổng', () => {
  let { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 300);
  ({ cart } = mk([{ code: 'P', type: 'percent', percent: 33 }]));
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 99);
});

test('mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('endsAt dùng được hết ngày UTC', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ kho khi sửa/xóa', () => {
  const { cart, inv } = mk();
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

test('thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('B', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 100);
  assert.equal(t.tax, 10);
  assert.equal(t.total, 110);
});

test('mã giảm cố định đổi số tiền sang xu đúng (1.005 → 101)', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('B', 2);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});
