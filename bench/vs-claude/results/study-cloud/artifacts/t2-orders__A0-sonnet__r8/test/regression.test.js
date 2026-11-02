'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function mk(products, stock, promos) {
  const inv = new Inventory(stock);
  return { inv, cart: new Cart(new Catalog(products), inv, promos) };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ sku: 'A', name: 'a', price: 10, category: 'c' }], { A: 5 },
    [{ code: 'F', type: 'fixed', amount: 1.005, minSubtotal: 1.005 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.equal(allocate(7, [1, 1, 1]).reduce((a, b) => a + b), 7);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const { cart } = mk([
    { sku: 'A', name: 'a', price: 1, category: 'c' },
    { sku: 'B', name: 'b', price: 1, category: 'c' },
    { sku: 'C', name: 'c', price: 1, category: 'c' },
  ], { A: 5, B: 5, C: 5 }, [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 300); // giảm không vượt giỏ
  const { cart: c2 } = mk([
    { sku: 'A', name: 'a', price: 4, category: 'c' },
    { sku: 'B', name: 'b', price: 4, category: 'c' },
    { sku: 'C', name: 'c', price: 4, category: 'c' },
  ], { A: 5, B: 5, C: 5 }, [{ code: 'F', type: 'fixed', amount: 10 }]);
  for (const s of ['A', 'B', 'C']) c2.addItem(s);
  c2.applyCoupon('F');
  const t = computeTotals(c2);
  assert.equal(t.discount, 1000);
  assert.deepEqual(t.lines.map((l) => l.discount), [334, 333, 333]);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('#4 mã dùng được tới hết ngày endsAt (UTC)', () => {
  const { cart } = mk([{ sku: 'A', name: 'a', price: 1, category: 'c' }], { A: 5 },
    [{ code: 'X', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('X', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('X', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('X', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('#5 giữ chỗ tồn kho khớp tổng số lượng trong giỏ', () => {
  const { cart, inv } = mk([{ sku: 'A', name: 'a', price: 1, category: 'c' }], { A: 4 });
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
  assert.throws(() => cart.addItem('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ sku: 'A', name: 'a', price: 100, category: 'c' }], { A: 5 },
    [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
