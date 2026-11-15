'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits, checkValidity, PromotionError } = require('../src/promotions');
const { lineTax } = require('../src/tax');

function setup(promos = []) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' },
    { sku: 'R', name: 'R', price: 10, category: 'x', taxClass: 'reduced' },
    { sku: 'Z', name: 'Z', price: 10, category: 'x', taxClass: 'zero' },
  ]);
  const inv = new Inventory({ A: 10, R: 10, Z: 10 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents: số dương và số nguyên', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(5), 500);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.1), 10);
  assert.equal(toCents(19.99), 1999);
});

test('allocate: tổng bằng đúng tổng đầu vào', () => {
  for (const [t, w] of [[100, [1, 1, 1]], [101, [3, 5, 7]], [1, [1, 1]], [999, [10, 20, 30, 40]]]) {
    const r = allocate(t, w);
    assert.equal(r.length, w.length);
    assert.equal(r.reduce((a, b) => a + b, 0), t);
  }
});

test('allocate: chia hết', () => {
  assert.deepEqual(allocate(100, [1, 1]), [50, 50]);
  assert.deepEqual(allocate(90, [1, 2]), [30, 60]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

test('freeUnits: qty nhỏ hơn buy thì không tặng', () => {
  assert.equal(freeUnits(1, 2, 1), 0);
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(2, 3, 1), 0);
});

test('khuyến mãi theo khoảng ngày', () => {
  const p = { code: 'P', type: 'percent', percent: 10, startsAt: '2026-03-10', endsAt: '2026-03-12' };
  assert.throws(() => checkValidity(p, new Date('2026-03-09T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-11T12:00:00Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-03-13T00:00:01Z'), 0), PromotionError);
  assert.throws(() => checkValidity(p, new Date('2026-04-01T00:00:00Z'), 0), PromotionError);
});

test('giữ chỗ kho cơ bản khi addItem', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 3);
  assert.equal(inv.available('A'), 7);
  cart.addItem('A', 2);
  assert.equal(inv.available('A'), 5);
  assert.equal(cart.lines.get('A'), 5);
  assert.throws(() => cart.addItem('A', 6), { name: 'OutOfStockError' });
  assert.equal(inv.available('A'), 5);
});

test('thuế suất 0.1 / 0.05 / 0', () => {
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(1000, 'reduced'), 50);
  assert.equal(lineTax(1000, 'zero'), 0);
  const { cart } = setup();
  cart.addItem('A'); cart.addItem('R'); cart.addItem('Z');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.tax), [100, 50, 0]);
  assert.equal(t.subtotal, 3000);
  assert.equal(t.total, 3150);
});
