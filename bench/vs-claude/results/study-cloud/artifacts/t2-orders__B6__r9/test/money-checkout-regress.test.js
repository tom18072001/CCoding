'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { computeTotals } = require('../src/checkout');

const mkCart = (items, coupon) => ({
  coupon,
  items: () => items.map(([sku, price, qty, taxClass = 'standard']) => ({ sku, qty, product: { priceCents: price, taxClass, category: 'c' } })),
});

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('allocate: tổng luôn đúng, phần dư lớn nhất, hòa thì đứng trước', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2]), [33, 67]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  for (const [t, w] of [[999, [3, 7, 11]], [1, [1, 1, 1]], [57, [5, 0, 9, 2]]]) {
    assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
});

test('giảm cố định 10.00 trên 3 món = 1000 xu', () => {
  const t = computeTotals(mkCart([['A', 1000, 1], ['B', 1000, 1], ['C', 1000, 1]], { type: 'fixed', amount: 10 }));
  assert.equal(t.discount, 1000);
  assert.deepEqual(t.lines.map((l) => l.discount), [334, 333, 333]);
});

test('giảm % đủ tổng', () => {
  const t = computeTotals(mkCart([['A', 333, 1], ['B', 333, 1], ['C', 334, 1]], { type: 'percent', percent: 10 }));
  assert.equal(t.discount, 100);
});

test('thuế tính trên net', () => {
  const t = computeTotals(mkCart([['A', 10000, 1]], { type: 'fixed', amount: 50 }));
  assert.equal(t.lines[0].net, 5000);
  assert.equal(t.tax, 500);
  assert.equal(t.total, 5500);
});
