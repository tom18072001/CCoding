'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits, checkValidity } = require('../src');

function mk(products, stock, promos = []) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(products), inv, promos), inv };
}

test('#1 toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-0.001), 0);
  assert.equal(new Catalog([{ sku: 'A', price: 1.005 }]).get('A').priceCents, 101);
});

test('#2 allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 1, 1, 1]), [2, 1, 1, 1]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
});

test('#2 giảm cố định và % khớp tổng', () => {
  const prods = ['A', 'B', 'C'].map((sku) => ({ sku, price: 10, category: 'x' }));
  for (const promo of [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }]) {
    const { cart } = mk(prods, { A: 5, B: 5, C: 5 }, [promo]);
    ['A', 'B', 'C'].forEach((s) => cart.addItem(s));
    cart.applyCoupon(promo.code);
    const t = computeTotals(cart);
    assert.equal(t.discount, promo.type === 'fixed' ? 1000 : 990);
  }
});

test('#3 mua X tặng Y', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(4, 1, 1), 2);
});

test('#4 endsAt hết ngày UTC', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('#5 giữ chỗ khi sửa/xóa', () => {
  const { cart, inv } = mk([{ sku: 'A', price: 1 }], { A: 4 });
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
  const { cart } = mk([{ sku: 'A', price: 100 }], { A: 5 }, [{ code: 'H', type: 'percent', percent: 50 }]);
  cart.addItem('A');
  cart.applyCoupon('H');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
