'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 1, category: 'x' },
    { sku: 'B', name: 'B', price: 1, category: 'x' },
    { sku: 'C', name: 'C', price: 1, category: 'x' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 4, C: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('#1 giá sản phẩm và mã cố định dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }], [{ sku: 'P', name: 'P', price: 1.005, category: 'x' }], { P: 5 });
  cart.addItem('P', 1);
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 101);
  assert.equal(t.discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const prods = [1, 2, 3].map((n) => ({ sku: 'S' + n, name: 'S', price: 4, category: 'x' }));
  const f = setup([{ code: 'F', type: 'fixed', amount: 10 }], prods, { S1: 5, S2: 5, S3: 5 });
  for (const s of ['S1', 'S2', 'S3']) f.cart.addItem(s, 1);
  f.cart.applyCoupon('F');
  assert.equal(computeTotals(f.cart).discount, 1000);
  const p = setup([{ code: 'P', type: 'percent', percent: 10 }], prods, { S1: 5, S2: 5, S3: 5 });
  for (const s of ['S1', 'S2', 'S3']) p.cart.addItem(s, 1);
  p.cart.applyCoupon('P');
  assert.equal(computeTotals(p.cart).discount, 120);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
});

test('#4 endsAt tới hết ngày (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho khi sửa/xóa', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('B', 2);
  cart.updateQty('B', 0);
  assert.equal(inv.available('B'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], [{ sku: 'M', name: 'M', price: 10, category: 'x' }], { M: 5 });
  cart.addItem('M', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
