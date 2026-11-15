'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;
const { generate } = require('../src/gen');

const optSets = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-08' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2026-01' }];

for (const seed of [1, 2, 3, 7, 42]) {
  test(`giống bản cũ, seed ${seed}`, () => {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    for (const o of optSets) assert.deepEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o));
  });
}

test('giống bản cũ: trường hợp biên', () => {
  const products = [{ sku: 'A', name: 'a1', category: 'X' }, { sku: 'A', name: 'a2', category: 'Y' }, { sku: 'B', name: 'b', category: 'X' }];
  const mk = (id, c, sku, qty, unitPrice, date, status) => ({ id, customerId: c, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 10, '2025-01-01T00:00:00Z', 'refunded'),
    mk('1', 'd', 'B', 2, 10, '2025-01-31T23:30:00-05:00', 'refunded'),
    mk('2', 'c', 'Z', 1, 5, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('2', 'd', 'B', 1, 5, '2025-02-01T00:00:00Z', 'paid'),
    mk('3', 'e', 'B', 3, 5, '2025-02-01T00:00:00Z', 'paid'),
    mk('4', 'f', 'B', 3, 5, '2025-03-01T00:00:00Z', 'cancelled'),
  ];
  for (const o of optSets.concat([{ topN: 10 }])) assert.deepEqual(buildReport(orders, products, o), legacy(orders, products, o));
  assert.deepEqual(buildReport([], products), legacy([], products));
});
