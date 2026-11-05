'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity, lineTax } = require('../src');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products || [
    { sku: 'A', name: 'a', price: 3.33, category: 'x' },
    { sku: 'B', name: 'b', price: 3.33, category: 'x' },
    { sku: 'C', name: 'c', price: 3.34, category: 'y' },
  ]);
  const inv = new Inventory(stock || { A: 4, B: 4, C: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(-0.001), 0);
  assert.ok(!Object.is(toCents(-0.001), -0));
  assert.equal(toCents(1e-7), 0);
  assert.equal(new Catalog([{ sku: 'P', price: 1.005 }]).get('P').priceCents, 101);
});

test('#1 mã fixed và minSubtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }], [{ sku: 'Q', price: 5 }], { Q: 3 });
  cart.addItem('Q');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  const c2 = new Cart(new Catalog([{ sku: 'Q', price: 1.005 }]), new Inventory({ Q: 1 }), [{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }]);
  c2.addItem('Q');
  assert.doesNotThrow(() => c2.applyCoupon('M'));
});

test('#2 allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(10, [1, 2, 3]).reduce((a, b) => a + b), 10);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(7, [0, 1, 0]), [0, 7, 0]);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const f = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 15 }]);
  for (const s of ['A', 'B', 'C']) f.cart.addItem(s);
  f.cart.applyCoupon('F');
  let t = computeTotals(f.cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
  f.cart.applyCoupon('P');
  t = computeTotals(f.cart);
  assert.equal(t.discount, 150);
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('#3 bxgy trong hóa đơn', () => {
  const { cart } = setup([{ code: 'B21', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.applyCoupon('B21');
  cart.addItem('A', 2);
  assert.equal(computeTotals(cart).discount, 0);
  cart.updateQty('A', 3);
  assert.equal(computeTotals(cart).discount, 333);
});

test('#4 endsAt tới hết ngày UTC', () => {
  const p = { code: 'E', endsAt: '2026-11-30', startsAt: '2026-11-01' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
  assert.throws(() => checkValidity(p, new Date('2026-10-31T23:59:59Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-01T00:00:00Z'), 0));
});

test('#5 giữ chỗ tồn kho khi sửa/xóa', () => {
  const { cart, inv } = setup([], [{ sku: 'A', price: 1 }], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
  assert.equal(cart.lines.get('A'), 1);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], [{ sku: 'A', price: 10 }], { A: 5 });
  cart.addItem('A', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
  assert.equal(lineTax(25, 'standard'), 3);
  assert.equal(lineTax(30, 'reduced'), 2);
});
