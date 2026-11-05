'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, lineTax } = require('../src');

function mk(products, stock, promos) {
  const inv = new Inventory(stock);
  return { inv, cart: new Cart(new Catalog(products), inv, promos) };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ sku: 'A', name: 'a', price: 20, category: 'x' }], { A: 5 },
    [{ code: 'F', type: 'fixed', amount: 1.005, minSubtotal: 1.005 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
  assert.equal(allocate(7, [1, 1, 1]).reduce((a, b) => a + b), 7);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = mk([
    { sku: 'A', name: 'a', price: 1, category: 'x' },
    { sku: 'B', name: 'b', price: 1, category: 'x' },
    { sku: 'C', name: 'c', price: 1, category: 'x' },
  ], { A: 1, B: 1, C: 1 }, [{ code: 'F', type: 'fixed', amount: 1 }, { code: 'P', type: 'percent', percent: 10 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 100);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 30);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const { cart } = mk([{ sku: 'A', name: 'a', price: 1, category: 'x' }], { A: 1 }, [{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo tổng số lượng trong giỏ', () => {
  const { cart, inv } = mk([{ sku: 'A', name: 'a', price: 1, category: 'x' }], { A: 4 });
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
  const { cart } = mk([{ sku: 'A', name: 'a', price: 100, category: 'x' }], { A: 5 }, [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
  assert.equal(lineTax(5, 'reduced'), 0 + 0); // 0.25 → 0
  assert.equal(lineTax(10, 'reduced'), 1);
});
