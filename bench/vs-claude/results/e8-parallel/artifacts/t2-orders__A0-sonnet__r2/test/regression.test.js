'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, roundHalfAway } = require('../src');

function mk(promos, stock = { A: 10, B: 10, C: 10 }, price = 10) {
  const cat = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(cat, inv, promos), inv };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(new Catalog([{ sku: 'P', price: 1.005 }]).get('P').priceCents, 101);
});

test('#1 mã cố định và minSubtotal dùng toCents', () => {
  const { cart } = mk([{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  const m = mk([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], undefined, 1.005);
  m.cart.addItem('A');
  m.cart.applyCoupon('M');
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.equal(allocate(7, [3, 3, 3, 1]).reduce((a, b) => a + b), 7);
});

test('#2 tổng giảm đúng số tiền mã', () => {
  const f = mk([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }]);
  for (const s of ['A', 'B', 'C']) f.cart.addItem(s);
  f.cart.applyCoupon('F');
  assert.equal(computeTotals(f.cart).discount, 1000);
  f.cart.applyCoupon('P');
  assert.equal(computeTotals(f.cart).discount, 300);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const { cart } = mk([{ code: 'E', type: 'percent', percent: 5, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), { name: 'PromotionError' });
});

test('#5 giữ chỗ tồn kho khớp số lượng giỏ', () => {
  const { cart, inv } = mk([], { A: 4, B: 1, C: 1 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), { name: 'OutOfStockError' });
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = mk([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
  assert.equal(roundHalfAway(-2.5), -3);
});
