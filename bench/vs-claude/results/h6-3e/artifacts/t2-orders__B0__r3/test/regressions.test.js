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

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [333, 333, 334]), [333, 333, 334]);
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 15 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(1000 * 15 / 100));
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 sửa số lượng và xóa món cập nhật giữ chỗ', () => {
  const { cart, inv } = setup();
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
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], [
    { sku: 'T', name: 'T', price: 10, category: 'x' },
  ], { T: 5 });
  cart.addItem('T');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
