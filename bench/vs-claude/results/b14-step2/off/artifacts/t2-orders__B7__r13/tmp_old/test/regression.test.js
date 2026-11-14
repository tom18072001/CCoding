'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function mk(products, stock, promos) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(products), inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  const { cart } = mk([{ sku: 'A', price: 1.005 }], { A: 5 }, [{ code: 'F', type: 'fixed', amount: 2.675 }]);
  cart.addItem('A', 5);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 268);
  const m = mk([{ sku: 'A', price: 1.01 }], { A: 1 }, [{ code: 'M', type: 'percent', percent: 1, minSubtotal: 1.005 }]);
  m.cart.addItem('A');
  m.cart.applyCoupon('M'); // 101 xu >= 101 xu
});

test('#2 allocate largest remainder & tổng giảm đúng', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  const { cart } = mk(
    [{ sku: 'A', price: 1 }, { sku: 'B', price: 1 }, { sku: 'C', price: 1 }],
    { A: 1, B: 1, C: 1 },
    [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }],
  );
  for (const s of 'ABC') cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 300);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 99);
});

test('#2b fixed 10.00 trên 3 món giá lẻ', () => {
  const { cart } = mk(
    [{ sku: 'A', price: 3.33 }, { sku: 'B', price: 3.33 }, { sku: 'C', price: 3.34 }],
    { A: 1, B: 1, C: 1 },
    [{ code: 'F', type: 'fixed', amount: 5 }],
  );
  for (const s of 'ABC') cart.addItem(s);
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 500);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 500);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ tồn kho theo giỏ', () => {
  const { cart, inv } = mk([{ sku: 'A', price: 1 }], { A: 4 }, []);
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ sku: 'A', price: 100 }], { A: 1 }, [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
