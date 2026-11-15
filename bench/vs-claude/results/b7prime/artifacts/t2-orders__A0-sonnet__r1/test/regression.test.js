'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 1, category: 'x' },
    { sku: 'B', name: 'B', price: 1, category: 'x' },
    { sku: 'C', name: 'C', price: 1, category: 'y', taxClass: 'reduced' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 4, C: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(12.34), 1234);
});

test('#1 giá, mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'M', type: 'fixed', amount: 1.005, minSubtotal: 2.675 }],
    [{ sku: 'P', name: 'P', price: 2.675, category: 'x' }], { P: 5 });
  cart.addItem('P');
  assert.equal(cart.subtotalCents(), 268);
  cart.applyCoupon('M');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3]), [1, 4]);
  assert.deepEqual(allocate(10, [1, 1, 1]).reduce((a, b) => a + b), 10);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.catalog.add({ sku: 'A', name: 'A', price: 33.33, category: 'x' });
  cart.catalog.add({ sku: 'B', name: 'B', price: 33.33, category: 'x' });
  cart.catalog.add({ sku: 'C', name: 'C', price: 33.34, category: 'y' });
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('#4 mã dùng được hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo tổng số lượng trong giỏ', () => {
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
  cart.addItem('B', 4);
  assert.throws(() => cart.updateQty('B', 5), /Hết hàng/);
  assert.equal(inv.available('B'), 0);
});

test('#6 thuế tính trên net sau giảm', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }],
    [{ sku: 'S', name: 'S', price: 100, category: 'x' }], { S: 5 });
  cart.addItem('S');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
