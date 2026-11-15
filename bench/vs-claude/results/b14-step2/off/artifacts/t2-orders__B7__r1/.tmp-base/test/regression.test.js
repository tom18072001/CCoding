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

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('#1 mã giảm cố định 3 chữ số thập phân', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('A', 3);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('#2 tổng giảm giá bằng đúng số tiền mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 0.1 }, { code: 'P', type: 'percent', percent: 33 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 10);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 99);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(5, 1, 2), 2);
});

test('#4 mã dùng được tới hết ngày endsAt (UTC)', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#1 minSubtotal làm tròn đúng', () => {
  const { cart } = setup(
    [{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }],
    [{ sku: 'A', name: 'A', price: 1.005, category: 'x' }],
  );
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('M'));
});

test('#5 sửa số lượng chỉ giữ chỗ phần chênh', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
});

test('#5 xóa món trả lại tồn kho', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('B', 2);
  cart.updateQty('B', 0);
  assert.equal(inv.available('B'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup(
    [{ code: 'P', type: 'percent', percent: 50 }],
    [{ sku: 'A', name: 'A', price: 10, category: 'x' }],
    { A: 5 },
  );
  cart.addItem('A', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});

test('#1 minSubtotal 1.005 yêu cầu tạm tính >= 1.01', () => {
  const { cart } = setup(
    [{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }],
    [{ sku: 'A', name: 'A', price: 1, category: 'x' }],
  );
  cart.addItem('A');
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
});
