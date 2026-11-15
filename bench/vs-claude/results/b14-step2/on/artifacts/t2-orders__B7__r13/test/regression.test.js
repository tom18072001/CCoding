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
});

test('allocate theo phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
});

test('giảm cố định/% tổng dòng đúng bằng số giảm của mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], undefined, 33.33);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(9999 * 0.1));
});

test('mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('mã dùng được hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ kho luôn bằng tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], undefined, 10);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});

test('hai giỏ dùng chung inventory: giỏ A xóa món thì giỏ B mua được', () => {
  const { cart: a, inv } = setup([], { A: 4 });
  const b = new Cart(a.catalog, inv, []);
  a.addItem('A', 3);
  assert.throws(() => b.addItem('A', 2), /Hết hàng/);
  a.removeItem('A');
  b.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
  assert.equal(b.lines.get('A'), 4);
});

test('updateQty tăng rồi giảm: số giữ chỗ bằng tổng số lượng các giỏ', () => {
  const { cart: a, inv } = setup([], { A: 4 });
  const b = new Cart(a.catalog, inv, []);
  a.addItem('A', 2);
  a.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  a.updateQty('A', 1);
  assert.equal(inv.reserved.get('A'), 1);
  b.addItem('A', 3);
  assert.equal(inv.reserved.get('A'), 4);
  assert.throws(() => a.updateQty('A', 2), /Hết hàng/);
  assert.equal(inv.reserved.get('A'), 4);
  a.updateQty('A', 0);
  assert.equal(inv.reserved.get('A'), 3);
});
