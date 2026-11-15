'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

const mk = (promos, stock = { A: 10, B: 10, C: 10 }, price = 4.01) => {
  const cat = new Catalog(['A', 'B', 'C'].map((s) => ({ sku: s, name: s, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(cat, inv, promos), inv };
};

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'percent', percent: 10, minSubtotal: 6.66 }]);
  cart.addItem('A', 2);
  cart.applyCoupon('M');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(2, [1, 5, 5]), [0, 1, 1]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 15 }]);
  for (const s of 'ABC') cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.discount, Math.round(t.subtotal * 0.15));
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), t.discount);
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(3, 2, 2), 0);
  assert.equal(freeUnits(4, 2, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 kho: sửa số lượng và xóa món', () => {
  const { cart, inv } = mk([], { A: 4, B: 1, C: 1 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  assert.throws(() => cart.addItem('A', 5));
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const cat = new Catalog([{ sku: 'A', name: 'A', price: 100, category: 'x' }]);
  const cart = new Cart(cat, new Inventory({ A: 5 }), [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
