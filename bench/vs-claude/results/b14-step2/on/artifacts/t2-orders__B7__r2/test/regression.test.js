'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 1) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
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

test('giá sản phẩm 1.005 lưu là 101 xu', () => {
  const c = new Catalog([{ sku: 'X', name: 'x', price: 1.005, category: 'x' }]);
  assert.equal(c.get('X').priceCents, 101);
});

test('allocate: phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 1]), [3, 2]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
});

test('giảm cố định 10.00 trên giỏ 3 món: tổng giảm đúng 1000', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }], undefined, 10);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('giảm % tổng đúng bằng số giảm của mã', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }], undefined, 3.33);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.discount, Math.round(t.subtotal * 0.1));
});

test('freeUnits mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('mã dùng được đến hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A', 1);
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('kho: sửa số lượng và xóa món cập nhật giữ chỗ', () => {
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
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], undefined, 10);
  cart.addItem('A', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
