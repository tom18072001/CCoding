'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 3.33, category: 'x', taxClass: 'standard' },
    { sku: 'B', name: 'b', price: 3.33, category: 'x', taxClass: 'standard' },
    { sku: 'C', name: 'c', price: 3.34, category: 'y', taxClass: 'standard' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#2 allocate phần dư lớn nhất, tổng khớp', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [0, 1, 1]), [0, 3, 2]);
});

test('#2 giảm cố định/% tổng giảm đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1 }, { code: 'P', type: 'percent', percent: 15 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 100);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(1000 * 0.15));
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(4, 1, 1), 2);
});

test('#4 endsAt dùng được hết ngày UTC', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), { name: 'PromotionError' });
});

test('#5 giữ chỗ kho khi sửa/xóa', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A', 2); // 666
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 333);
  assert.equal(t.tax, 33);
  assert.equal(t.total, 366);
});
