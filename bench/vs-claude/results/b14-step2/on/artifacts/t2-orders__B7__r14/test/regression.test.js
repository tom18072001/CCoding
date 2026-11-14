'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function setup(promos = []) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const inv = new Inventory({ TEA: 10, MUG: 5 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('allocate phần dư lớn nhất, tổng đúng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('giảm cố định và % chia đủ tổng', () => {
  const catalog = new Catalog([1, 2, 3].map((n) => ({ sku: 'S' + n, name: 'x', price: 10, category: 'c', taxClass: 'zero' })));
  const cart = new Cart(catalog, new Inventory({ S1: 5, S2: 5, S3: 5 }), [
    { code: 'F', type: 'fixed', amount: 10 },
    { code: 'P', type: 'percent', percent: 10 },
  ]);
  ['S1', 'S2', 'S3'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 300);
});

test('mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('mã hiệu lực tới hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('TEA');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('giữ chỗ kho khi sửa/xóa', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 4);
  assert.equal(inv.available('MUG'), 1);
  cart.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 4);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 5);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'H', type: 'percent', percent: 50 }]);
  cart.addItem('MUG', 2);
  cart.applyCoupon('H');
  const t = computeTotals(cart);
  assert.equal(t.tax, 125);
  assert.equal(t.total, 1250 + 125);
});
