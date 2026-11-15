'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits, checkValidity } = require('../src/promotions');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.34, category: 'y' },
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

test('giá sản phẩm, mã cố định, minSubtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005, minSubtotal: 1.005 }],
    [{ sku: 'P', name: 'P', price: 1.005, category: 'x' }], { P: 5 });
  cart.addItem('P', 1);
  assert.equal(cart.subtotalCents(), 101);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('tổng giảm bằng đúng số tiền mã (fixed và percent)', () => {
  const a = setup([{ code: 'F', type: 'fixed', amount: 10 }]);
  for (const s of ['A', 'B', 'C']) a.cart.addItem(s, 1);
  a.cart.applyCoupon('F');
  assert.equal(computeTotals(a.cart).discount, 1000);
  const b = setup([{ code: 'P', type: 'percent', percent: 10 }]);
  for (const s of ['A', 'B', 'C']) b.cart.addItem(s, 1);
  b.cart.applyCoupon('P');
  assert.equal(computeTotals(b.cart).discount, 100);
});

test('mua 2 tặng 1', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('endsAt tới hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('giữ chỗ kho theo tổng số lượng giỏ', () => {
  const { cart, inv } = setup();
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

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }],
    [{ sku: 'M', name: 'M', price: 100, category: 'x' }], { M: 5 });
  cart.addItem('M', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
