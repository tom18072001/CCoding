'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');
const { generate } = require('../src/gen');

function same(orders, products, opts) {
  const a = buildReport(orders, products, opts);
  const b = legacy.buildReport(orders, products, opts);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); // cả thứ tự khóa
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 25, seed });
    for (const opts of [{}, { topN: 1 }, { topN: 0 }, { topN: 5, from: '2025-03' }, { to: '2025-08' }, { from: '2025-02', to: '2025-06', topN: 10 }, { from: '2030-01' }]) {
      same(d.orders, d.products, opts);
    }
  }
});

test('giống bản cũ với các trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Hai', category: 'X' },
    { sku: 'C', category: 'Z' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'a', 'A', 0, 100, '2025-01-31T23:30:00-05:00', 'refunded'),
    mk('1', 'a', 'B', 2, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('2', 'b', 'B', 2, 100, '2025-02-01T00:00:00Z', 'refunded'),
    mk('3', 'b', 'C', 1, 50, '2025-02-03T00:00:00Z', 'paid'),
    mk('4', 'c', 'ZZ', 3, 70, '2024-12-03T00:00:00Z', 'paid'),
    mk('5', 'c', 'ZZ', 3, 70, '2024-12-03T00:00:00Z', 'cancelled'),
    mk('6', 'd', 'B', 1, 100, '2025-02-01T00:00:00Z', 'refunded'),
    mk('7', 'a', 'A', 1, 100, '2025-02-01T00:00:00Z', 'paid'),
  ];
  same(orders, products, {});
  same(orders, products, { topN: 1, from: '2025-02' });
  same([], products, {});
  same(orders.filter((o) => o.status === 'refunded'), products, {});
  same(orders, [], {});
});
