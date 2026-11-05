'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity, lineTax } = require('../src');

function setup(promos = [], stock = { A: 10, B: 10, C: 10, BOX: 20 }, price = 10) {
  const catalog = new Catalog(['A', 'B', 'C', 'BOX'].map((sku) => ({ sku, name: sku, price, category: sku === 'A' ? 'x' : 'y' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv, catalog };
}

test('#1 toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-0.001), 0);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(1e21), 1e23);
});

test('#1 giá sản phẩm, mã cố định và minSubtotal dùng toCents', () => {
  const { cart, catalog, inv } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'M', type: 'fixed', amount: 1, minSubtotal: 1.005 }]);
  catalog.add({ sku: 'P', name: 'p', price: 1.005, category: 'z' });
  inv.stock.set('P', 5);
  assert.equal(catalog.get('P').priceCents, 101);
  cart.addItem('P', 1);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  cart.removeCoupon();
  cart.applyCoupon('M'); // subtotal 101 >= 101
});

test('#2 allocate: phần dư lớn nhất, hòa thì đứng trước', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2]), [33, 67]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(1, [0, 1, 1]), [0, 1, 0]);
  const r = allocate(12345, [3, 7, 11, 13]);
  assert.equal(r.reduce((a, b) => a + b, 0), 12345);
});

test('#2 tổng giảm bằng đúng số tiền mã', () => {
  const fixed = setup([{ code: 'F', type: 'fixed', amount: 10 }]);
  for (const s of ['A', 'B', 'C']) fixed.cart.addItem(s);
  fixed.cart.applyCoupon('F');
  assert.equal(computeTotals(fixed.cart).discount, 1000);
  const pct = setup([{ code: 'P', type: 'percent', percent: 10 }], undefined, 3.33);
  for (const s of ['A', 'B', 'C']) pct.cart.addItem(s);
  pct.cart.applyCoupon('P');
  const t = computeTotals(pct.cart);
  assert.equal(t.discount, 100); // 999 * 10% = 99.9 -> 100
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('#3 mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  const { cart } = setup([{ code: 'B', type: 'bxgy', sku: 'BOX', buy: 2, free: 1 }]);
  cart.addItem('BOX', 2);
  cart.applyCoupon('B');
  assert.equal(computeTotals(cart).discount, 0);
  cart.updateQty('BOX', 6);
  assert.equal(computeTotals(cart).discount, 2000);
});

test('#4 endsAt hiệu lực hết ngày (UTC)', () => {
  const p = { code: 'E', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
  assert.throws(() => checkValidity({ code: 'S', startsAt: '2026-11-30' }, new Date('2026-11-29T23:59:59Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity({ code: 'S', startsAt: '2026-11-30' }, new Date('2026-11-30T00:00:00Z'), 0));
});

test('#5 giữ chỗ tồn kho khớp với tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), /Hết hàng/);
  assert.equal(inv.available('A'), 3);
  assert.equal(cart.lines.get('A'), 1);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A'); // lặp lại không làm sai
  assert.equal(inv.available('A'), 4);
  cart.addItem('A', 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
});

test('#6 thuế tính trên giá sau giảm', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A', 2); // gross 2000
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
  assert.equal(lineTax(5, 'standard'), 1); // 0.5 -> half up
  assert.equal(lineTax(15, 'reduced'), 1); // 0.75
});
