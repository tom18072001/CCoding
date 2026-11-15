'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits, checkValidity } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.34, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.33, category: 'y', taxClass: 'reduced' },
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

test('allocate: phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('mã giảm cố định/% : tổng giảm khớp', () => {
  let { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s)); cart.applyCoupon(cart.promotions.keys().next().value);
  assert.equal(computeTotals(cart).discount, 1000);
  ({ cart } = setup([{ code: 'P', type: 'percent', percent: 10 }]));
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s)); cart.applyCoupon(cart.promotions.keys().next().value);
  const t = computeTotals(cart);
  assert.equal(t.discount, Math.round(t.subtotal * 0.1));
});

test('bxgy', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('endsAt tính tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('kho: sửa số lượng và xóa giải phóng giữ chỗ', () => {
  const { cart, inv } = setup([], { A: 4, B: 1, C: 1 });
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

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('C', 3); cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].tax, Math.round(t.lines[0].net * 0.05));
  assert.equal(t.total, t.lines[0].net + t.lines[0].tax);
});
