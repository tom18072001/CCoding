'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function mk(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 1) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.equal(allocate(7, [1, 2, 4]).reduce((a, b) => a + b, 0), 7);
});

test('#2 mã cố định 10.00 trên giỏ 3 món: tổng giảm đúng 1000', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }], undefined, 10);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('#2 mã % tổng giảm khớp', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 10 }], undefined, 3.33);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round((999 * 10) / 100));
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ kho khi sửa/xóa', () => {
  const { cart, inv } = mk([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], undefined, 10);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
