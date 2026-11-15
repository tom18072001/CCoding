'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function setup(promos = [], stock = { A: 4, B: 10, C: 10 }, prices = [1, 1, 1]) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku, i) => ({ sku, name: sku, price: prices[i], category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'percent', percent: 10, minSubtotal: 3.005 }], undefined, [1, 1, 1]);
  cart.addItem('B', 3);
  assert.equal(computeTotals(cart).subtotal, 300);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3]), [1, 4]);
  assert.deepEqual(allocate(0, [0, 0]), [0, 0]);
});

test('#2 tổng giảm bằng số tiền của mã', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 300);
  const { cart: c2 } = setup([{ code: 'F', type: 'fixed', amount: 10 }], undefined, [10, 10, 10]);
  c2.addItem('A'); c2.addItem('B'); c2.addItem('C');
  c2.applyCoupon('F');
  assert.equal(computeTotals(c2).discount, 1000);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 1, 1), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 kho: sửa số lượng và xóa món', () => {
  const { cart, inv } = setup();
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

test('#6 thuế tính trên net', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 100, category: 'x' }]);
  const cart = new Cart(catalog, new Inventory({ A: 5 }), [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
