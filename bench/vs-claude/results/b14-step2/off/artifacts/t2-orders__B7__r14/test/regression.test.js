'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(products, stock, promos = []) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(products), inv, promos), inv };
}

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [0, 1, 1]), [0, 3, 2]);
});

test('giảm cố định 10.00 cho 3 dòng đúng tổng', () => {
  const p = [1, 2, 3].map((n) => ({ sku: 'S' + n, name: 'x', price: 10, category: 'c' }));
  const { cart } = setup(p, { S1: 5, S2: 5, S3: 5 }, [{ code: 'F', type: 'fixed', amount: 10 }]);
  ['S1', 'S2', 'S3'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('mua 2 tặng 1', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('mã dùng được hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ sku: 'A', name: 'a', price: 1, category: 'c' }], { A: 1 }, [{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ kho theo tổng số lượng giỏ', () => {
  const { cart, inv } = setup([{ sku: 'A', name: 'a', price: 1, category: 'c' }], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ sku: 'A', name: 'a', price: 100, category: 'c' }], { A: 1 }, [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
