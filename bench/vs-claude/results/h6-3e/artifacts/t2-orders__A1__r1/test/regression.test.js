'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, lineTax } = require('../src');

function mk(products, stock, promos) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(products), inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(0.1), 10);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(1e21), 1e23);
  assert.equal(toCents(-0.001), 0);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.004), 0);
  assert.equal(toCents(0.005), 1);
});

test('#1 mã giảm cố định 1.005 -> 101 xu', () => {
  const { cart } = mk([{ sku: 'A', price: 10 }], { A: 5 }, [{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#1 minSubtotal và giá 1.005', () => {
  const { cart } = mk([{ sku: 'A', price: 1.005 }], { A: 5 }, [{ code: 'M', type: 'fixed', amount: 1, minSubtotal: 1.005 }]);
  cart.addItem('A');
  assert.equal(computeTotals(cart).subtotal, 101);
  cart.applyCoupon('M');
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(2, [1, 2, 1]), [1, 1, 0]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const products = [{ sku: 'A', price: 3.33 }, { sku: 'B', price: 3.33 }, { sku: 'C', price: 3.34 }];
  const promos = [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }];
  const { cart } = mk(products, { A: 9, B: 9, C: 9 }, promos);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
  cart.applyCoupon('F');
  let t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
  cart.applyCoupon('P');
  t = computeTotals(cart);
  assert.equal(t.discount, 330);
});

test('#2 mã cố định không làm giỏ âm', () => {
  const { cart } = mk([{ sku: 'A', price: 1 }], { A: 9 }, [{ code: 'F', type: 'fixed', amount: 10 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 100);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
});

test('#3 bxgy trong hóa đơn', () => {
  const { cart } = mk([{ sku: 'BOX', price: 10 }], { BOX: 10 }, [{ code: 'B', type: 'bxgy', sku: 'BOX', buy: 2, free: 1 }]);
  cart.addItem('BOX', 2);
  cart.applyCoupon('B');
  assert.equal(computeTotals(cart).discount, 0);
  cart.updateQty('BOX', 3);
  assert.equal(computeTotals(cart).discount, 1000);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const { cart } = mk([{ sku: 'A', price: 10 }], { A: 5 }, [{ code: 'P', type: 'percent', percent: 10, endsAt: '2026-11-30', startsAt: '2026-11-01' }]);
  cart.addItem('A');
  cart.applyCoupon('P', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('P', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('P', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
  assert.throws(() => cart.applyCoupon('P', new Date('2026-10-31T23:59:59Z')), /chưa tới/);
  cart.applyCoupon('P', new Date('2026-11-01T00:00:00Z'));
});

test('#5 sửa số lượng chỉ giữ phần chênh', () => {
  const { cart, inv } = mk([{ sku: 'A', price: 1 }], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
  assert.equal(cart.lines.get('A'), 1);
});

test('#5 xóa món trả lại kho', () => {
  const { cart, inv } = mk([{ sku: 'A', price: 1 }], { A: 4 });
  cart.addItem('A', 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ sku: 'A', price: 100 }], { A: 5 }, [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});

test('thuế làm tròn half up', () => {
  assert.equal(lineTax(5, 'standard'), 1);
  assert.equal(lineTax(4, 'standard'), 0);
  assert.equal(lineTax(10, 'reduced'), 1);
  assert.equal(lineTax(9, 'reduced'), 0);
  assert.equal(lineTax(1000, 'zero'), 0);
});
