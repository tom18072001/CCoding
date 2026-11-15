'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, checkValidity, freeUnits } = require('../src');

function setup(promos = [], price = 10, stock = 10) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price, category: 'x' },
    { sku: 'B', name: 'B', price, category: 'y' },
    { sku: 'C', name: 'C', price, category: 'x' },
  ]);
  const inv = new Inventory({ A: stock, B: stock, C: stock });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(-0.001), 0);
});

test('#1 giá, mã cố định, giá trị tối thiểu dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'fixed', amount: 1, minSubtotal: 10.005 }], 1.005);
  cart.addItem('A', 1);
  assert.equal(cart.subtotalCents(), 101);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3]), [1, 4]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
});

test('#2 tổng giảm bằng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], 4.33);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 130);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 kho: sửa số lượng và xóa món', () => {
  const { cart, inv } = setup([], 10, 4);
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

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], 10);
  cart.addItem('A', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
