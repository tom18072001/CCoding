'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate, Catalog, Inventory, Cart, computeTotals, freeUnits, checkValidity } = require('../src');

const mk = (stock, promos, prods) => {
  const cat = new Catalog(prods || [{ sku: 'A', name: 'a', price: 10, category: 'x' }, { sku: 'B', name: 'b', price: 10, category: 'x' }, { sku: 'C', name: 'c', price: 10, category: 'x' }]);
  const inv = new Inventory(stock || { A: 4, B: 4, C: 4 });
  return { inv, cart: new Cart(cat, inv, promos || []) };
};

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk(null, [{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'percent', percent: 10, minSubtotal: 10.005 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  assert.throws(() => cart.applyCoupon('M'));
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  const { cart } = mk(null, [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33.33 }]);
  for (const s of ['A', 'B', 'C']) cart.addItem(s);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(4, 1, 1), 2);
  assert.equal(freeUnits(5, 3, 2), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0));
});

test('#5 giữ chỗ kho', () => {
  const { cart, inv } = mk({ A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  assert.throws(() => cart.updateQty('A', 5));
});

test('#5 updateQty thất bại không đổi trạng thái; về 0 trả kho', () => {
  const { cart, inv } = mk({ A: 4 });
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', 9));
  assert.equal(inv.reserved.get('A'), 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk(null, [{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 50);
  assert.equal(t.total, 550);
});
