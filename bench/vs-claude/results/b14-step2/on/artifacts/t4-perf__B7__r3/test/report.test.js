'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { generate } = require('../src/gen');

test('báo cáo nhỏ', () => {
  const products = [{ sku: 'A', name: 'Trà', category: 'Đồ uống' }, { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' }];
  const orders = [
    { id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid' },
    { id: 'o1', customerId: 'c1', sku: 'B', qty: 1, unitPrice: 500, date: '2025-01-05T10:00:00Z', status: 'paid' },
    { id: 'o2', customerId: 'c2', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-02-01T03:00:00Z', status: 'refunded' },
    { id: 'o3', customerId: 'c2', sku: 'B', qty: 4, unitPrice: 500, date: '2025-02-02T03:00:00Z', status: 'cancelled' },
  ];
  const r = buildReport(orders, products);
  assert.deepEqual(r.months, ['2025-01', '2025-02']);
  assert.equal(r.grandTotal, 1500);
  assert.deepEqual(r.monthly[0], { month: '2025-01', revenue: 2500, refunds: 0, orders: 1, customers: 1, runningTotal: 2500 });
  assert.deepEqual(r.monthly[1], { month: '2025-02', revenue: -1000, refunds: 1000, orders: 0, customers: 0, runningTotal: 1500 });
  assert.equal(r.categories[0].category, 'Đồ uống');
  assert.deepEqual(r.topCustomers[0], { customerId: 'c1', revenue: 2500, orders: 1 });
});

test('dữ liệu sinh ngẫu nhiên chạy được', () => {
  const d = generate({ orders: 2000, seed: 3 });
  const r = buildReport(d.orders, d.products, { topN: 2 });
  assert.ok(r.categories.length > 0);
});

// So sánh với bản gốc (test/report.legacy.js) trên nhiều bộ dữ liệu.
const legacy = require('./report.legacy');

test('giống hệt bản gốc trên nhiều bộ dữ liệu', () => {
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-08' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2030-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 150, products: 5 + seed * 7, customers: 4 + seed * 5, seed });
    for (const o of optsList) assert.deepEqual(buildReport(d.orders, d.products, o), legacy.buildReport(d.orders, d.products, o));
  }
});

test('giống bản gốc ở các trường hợp biên', () => {
  const P = [{ sku: 'A', name: 'a1', category: 'X' }, { sku: 'A', name: 'a2', category: 'Y' }, { sku: 'B', name: 'b', category: 'X' }, { sku: 'C', name: 'c', category: 'Y' }];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const cases = [
    [],
    [mk('1', 'c', 'A', 1, 100, '2025-01-01T00:00:00Z', 'cancelled')],
    [mk('1', 'c', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'), mk('1', 'c', 'B', 2, 0, '2025-01-31T23:00:00-05:00', 'paid')],
    [mk('1', 'c', 'Z', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'A', 1, 100, '2025-12-31T23:59:59Z', 'paid'), mk('2', 'd', 'C', 1, 100, '2025-12-31T23:59:59Z', 'paid')],
    [mk('1', 'a', 'B', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'b', 'C', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('3', 'c', 'A', 2, 50, '2025-01-01T00:00:00Z', 'paid')],
    [mk('1', 'a', 'A', 1, 100, '2025-01-01T00:00:00Z', 'refunded'), mk('2', 'a', 'A', 1, 100, '2025-02-01T00:00:00Z', 'refunded')],
    [mk('1', 'a', 'A', undefined, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'b', 'B', 2, 100, '2025-01-01T00:00:00Z', 'paid')],
  ];
  for (const orders of cases) {
    for (const o of [{}, { topN: 1 }, { from: '2025-01', to: '2025-01' }]) {
      assert.deepEqual(buildReport(orders, P, o), legacy.buildReport(orders, P, o));
    }
  }
  assert.throws(() => buildReport([mk('1', 'c', 'A', 1, 1, 'bad', 'paid')], P), RangeError);
});
