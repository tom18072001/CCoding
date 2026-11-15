'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents làm tròn half away from zero', () => {
  assert.strictEqual(toCents(1.005), 101);
  assert.strictEqual(toCents(2.675), 268);
  assert.strictEqual(toCents(-1.005), -101);
  assert.strictEqual(toCents(-2.675), -268);
  assert.strictEqual(toCents(12.34), 1234);
  assert.strictEqual(toCents(0), 0);
  assert.strictEqual(toCents(1e-7), 0);
});

test('catalog dùng toCents', () => {
  const c = new Catalog([{ sku: 'a', name: 'a', price: 1.005, category: 'x' }]);
  assert.strictEqual(c.get('a').priceCents, 101);
});

test('allocate: 10.00 chia 3 dòng bằng nhau tổng đúng 1000', () => {
  const r = allocate(1000, [1, 1, 1]);
  assert.deepStrictEqual(r, [334, 333, 333]);
  assert.strictEqual(r.reduce((a, b) => a + b, 0), 1000);
});

test('allocate: phần dư lớn nhất, tổng khớp, trọng số 0', () => {
  assert.deepStrictEqual(allocate(10, [1, 2, 3]), [2, 3, 5]);
  assert.deepStrictEqual(allocate(5, [0, 0]), [0, 0]);
  const r = allocate(1001, [333, 333, 334]);
  assert.strictEqual(r.reduce((a, b) => a + b, 0), 1001);
});

test('tổng giảm của các dòng bằng đúng số tiền giảm của mã (fixed và %)', () => {
  const { Inventory, Cart, computeTotals } = require('../src');
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x' },
    { sku: 'B', name: 'B', price: 10, category: 'x' },
    { sku: 'C', name: 'C', price: 10, category: 'x' },
  ]);
  const mk = (promo) => {
    const cart = new Cart(catalog, new Inventory({ A: 5, B: 5, C: 5 }), [promo]);
    for (const s of ['A', 'B', 'C']) cart.addItem(s, 1);
    cart.applyCoupon(promo.code, new Date('2026-01-01T00:00:00Z'));
    return computeTotals(cart);
  };
  assert.strictEqual(mk({ code: 'F10', type: 'fixed', amount: 10 }).discount, 1000);
  assert.strictEqual(mk({ code: 'P33', type: 'percent', percent: 33.3333 }).discount, 1000);
});
