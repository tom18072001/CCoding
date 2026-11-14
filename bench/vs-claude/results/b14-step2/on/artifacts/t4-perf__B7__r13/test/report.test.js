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

// So sánh với bản cũ (test/report.legacy.js = bản gốc, đóng vai đặc tả)
const legacy = require('./report.legacy');

test('giống hệt bản cũ trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [{}, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09', topN: 1 }, { from: '2025-02', to: '2025-06', topN: 4 }, { from: '2026-01' }];
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy.buildReport(d.orders, d.products, o));
  }
});

test('giống bản cũ ở các trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Hai', category: 'X' },
    { sku: 'C', category: 'Z' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:30:00-05:00', 'refunded'),
    mk('1', 'c', 'B', 2, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('2', 'd', 'C', 1, 50, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('3', 'd', 'NOPE', 3, 70, '2025-03-01T00:00:00Z', 'refunded'),
    mk('4', 'e', 'B', 2, 100, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'e', 'B', 2, 100, '2025-02-10T00:00:00Z', 'cancelled'),
  ];
  for (const o of [{}, { topN: 1 }, { from: '2025-02', to: '2025-02' }]) {
    assert.deepStrictEqual(buildReport(orders, products, o), legacy.buildReport(orders, products, o));
  }
  assert.deepStrictEqual(buildReport([], products), legacy.buildReport([], products));
  assert.deepStrictEqual(buildReport([mk('1', 'c', 'A', 1, 1, '2025-01-01T00:00:00Z', 'cancelled')], products), legacy.buildReport([mk('1', 'c', 'A', 1, 1, '2025-01-01T00:00:00Z', 'cancelled')], products));
  assert.throws(() => buildReport([mk('1', 'c', 'A', 1, 1, 'bad', 'paid')], products), RangeError);
});
