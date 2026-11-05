'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: ref } = require('./report.orig.js');
const { generate } = require('../src/gen');

test('giống bản cũ trên dữ liệu sinh', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    for (const opt of [{}, { topN: 5 }, { topN: 0 }, { from: '2025-03', to: '2025-09' }, { from: '2025-11' }, { to: '2025-01', topN: 1 }]) {
      assert.deepStrictEqual(buildReport(d.orders, d.products, opt), ref(d.orders, d.products, opt));
    }
  }
});

test('giống bản cũ trên trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'a1', category: 'X' }, { sku: 'A', name: 'a2', category: 'Y' },
    { sku: 'B', name: 'b', category: 'X' }, { sku: 'C', name: 'c', category: 'X' },
  ];
  const mk = (id, c, sku, qty, p, date, status) => ({ id, customerId: c, sku, qty, unitPrice: p, date, status });
  const orders = [
    mk('1', 'c1', 'A', 1, 100, '2025-01-01T00:00:00Z', 'paid'),
    mk('1', 'c1', 'B', 2, 0, '2025-01-01T00:00:00Z', 'refunded'),
    mk('2', 'c2', 'B', 1, 100, '2025-01-31T23:00:00-05:00', 'paid'),
    mk('3', 'c2', 'C', 1, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('4', 'c3', 'ZZ', 1, 70, '2025-02-10T00:00:00Z', 'refunded'),
    mk('5', 'c3', 'C', undefined, 70, '2025-02-10T00:00:00Z', 'paid'),
    mk('6', 'c4', 'A', 1, 0.1, '2025-03-10T00:00:00Z', 'paid'),
    mk('7', 'c4', 'A', 1, 0.2, '2025-03-10T00:00:00Z', 'paid'),
    mk('8', 'c4', 'ZZ', 1, 5, '2025-03-10T00:00:00Z', 'cancelled'),
  ];
  for (const opt of [{}, { topN: 10 }, { from: '2025-02' }, { to: '2025-01' }]) {
    assert.deepStrictEqual(buildReport(orders, products, opt), ref(orders, products, opt));
  }
  assert.deepStrictEqual(buildReport([], products), ref([], products));
});
