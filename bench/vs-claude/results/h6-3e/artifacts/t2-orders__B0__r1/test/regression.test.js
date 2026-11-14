'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits, checkValidity } = require('../src/promotions');

function setup(promos = [], stock = { A: 10 }, price = 10) {
  const catalog = new Catalog(Object.keys(stock).map((sku) => ({ sku, name: sku, price, category: 'c' })));
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
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  assert.equal(allocate(7, [3, 3, 1]).reduce((a, b) => a + b, 0), 7);
});

test('tổng giảm giá bằng đúng số tiền của mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], { A: 9, B: 9, C: 9 }, 3.34);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(1002 * 0.1));
});

test('mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('endsAt dùng được hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('giữ chỗ tồn kho khớp tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
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
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], { A: 5 }, 10);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
