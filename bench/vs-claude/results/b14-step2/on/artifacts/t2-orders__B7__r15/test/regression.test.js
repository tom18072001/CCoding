'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

const mk = (promos, stock = { A: 10, B: 10, C: 10 }, prices = [1, 1, 1]) => {
  const cat = new Catalog(['A', 'B', 'C'].map((s, i) => ({ sku: s, name: s, price: prices[i], category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(cat, inv, promos), inv };
};

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 0.285 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 29);
});

test('#1 minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }]);
  cart.addItem('A', 1);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [1, 1, 1, 1]), [2, 1, 1, 1]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }], undefined, [10, 10, 10]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.deepEqual(t.lines.map((l) => l.discount), [334, 333, 333]);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 sửa số lượng và xóa giải phóng giữ chỗ', () => {
  const { cart, inv } = mk([], { A: 4, B: 1, C: 1 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('B');
  cart.updateQty('B', 0);
  assert.equal(inv.available('B'), 1);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }], undefined, [10, 10, 10]);
  cart.addItem('A', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
