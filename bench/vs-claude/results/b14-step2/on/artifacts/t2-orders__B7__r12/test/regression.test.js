'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function mk(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'a', price: 1, category: 'x' },
    { sku: 'B', name: 'b', price: 1, category: 'x' },
    { sku: 'C', name: 'c', price: 1, category: 'x' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 10, C: 10 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('mã fixed và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'fixed', amount: 1, minSubtotal: 3.005 }]);
  cart.addItem('A', 3);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('tổng giảm cố định bằng đúng số tiền của mã', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }], [
    { sku: 'A', name: 'a', price: 10, category: 'x' }, { sku: 'B', name: 'b', price: 10, category: 'x' }, { sku: 'C', name: 'c', price: 10, category: 'x' },
  ]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('tổng giảm % đúng', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 10 }], [
    { sku: 'A', name: 'a', price: 3.33, category: 'x' }, { sku: 'B', name: 'b', price: 3.33, category: 'x' }, { sku: 'C', name: 'c', price: 3.34, category: 'x' },
  ]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 100);
});

test('mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
});

test('endsAt dùng được tới hết ngày (UTC)', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ kho khớp tổng số lượng trong giỏ', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net sau giảm', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], [{ sku: 'A', name: 'a', price: 10, category: 'x' }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
