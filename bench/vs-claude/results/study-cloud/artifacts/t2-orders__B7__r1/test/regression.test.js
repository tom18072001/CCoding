'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 1.005, category: 'x' },
    { sku: 'B', name: 'B', price: 2.675, category: 'y' },
    { sku: 'C', name: 'C', price: 3, category: 'x', taxClass: 'reduced' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 10, C: 10 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('#1 mã giảm cố định và giá tối thiểu dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'fixed', amount: 1, minSubtotal: 1.005 }]);
  cart.addItem('B', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  assert.doesNotThrow(() => checkValidity({ code: 'M', minSubtotal: 1.005 }, new Date(), 101));
  assert.throws(() => checkValidity({ code: 'M', minSubtotal: 1.005 }, new Date(), 100), /tối thiểu/);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 7]), [1, 2, 7]);
  assert.deepEqual(allocate(2, [1, 3, 1, 3]), [0, 1, 0, 1]);
  assert.equal(allocate(5, [1, 1, 1, 0]).reduce((a, b) => a + b, 0), 5);
});

test('#2 tổng giảm bằng đúng số tiền của mã', () => {
  const products = [1, 2, 3].map((n) => ({ sku: `P${n}`, name: 'p', price: 10, category: 'x' }));
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], products, { P1: 9, P2: 9, P3: 9 });
  products.forEach((p) => cart.addItem(p.sku, 1));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 300);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(2, 1, 2), 0);
  assert.equal(freeUnits(3, 1, 2), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('C', 2); // 600, thuế reduced 5%
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 300);
  assert.equal(t.tax, 15);
  assert.equal(t.total, 315);
});
