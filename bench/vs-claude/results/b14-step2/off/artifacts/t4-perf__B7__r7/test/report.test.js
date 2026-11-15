'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { generate } = require('../src/gen');
const legacy = require('./report.legacy');

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

test('giống hệt bản cũ trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 150, products: 5 + seed * 3, customers: 4 + seed * 5, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy.buildReport(d.orders, d.products, o));
  }
});

test('giống hệt bản cũ với trường hợp lạ', () => {
  const products = [
    { sku: 'A', name: 'a1', category: 'X' },
    { sku: 'A', name: 'a2', category: 'Y' },
    { sku: 'B', name: 'b', category: 'X' },
    { sku: 'N', name: 'n' },
  ];
  const mk = (id, c, sku, qty, p, date, status) => ({ id, customerId: c, sku, qty, unitPrice: p, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'),
    mk('1', 'c', 'B', 2, 100, '2025-01-31T23:59:59-05:00', 'paid'),
    mk('2', 'd', 'N', 1, 100, '2025-01-01T00:00:00+07:00', 'paid'),
    mk('3', 'd', 'ZZ', 3, 50, '2025-02-01T00:00:00Z', 'weird'),
    mk('4', 'e', 'B', 2, -100, '2025-02-01T00:00:00Z', 'paid'),
    mk('5', 'e', 'B', 1, 100, '2025-02-01T00:00:00Z', 'refunded'),
    mk('6', 'c', 'A', 1, 100, '2025-03-01T00:00:00Z', 'cancelled'),
    mk('7', 'f', 'A', 1, 100, '2025-04-01T00:00:00Z', 'paid'),
  ];
  for (const o of [{}, { topN: 1 }, { topN: null }, { from: '2025-02' }, { to: '2025-01' }, { from: '2025-02', to: '2025-02' }]) {
    assert.deepStrictEqual(buildReport(orders, products, o), legacy.buildReport(orders, products, o));
  }
  assert.deepStrictEqual(buildReport([], products), legacy.buildReport([], products));
  assert.throws(() => buildReport([mk('x', 'c', 'A', 1, 1, 'bad', 'paid')], products), RangeError);
});

test('dữ liệu sinh ngẫu nhiên chạy được', () => {
  const d = generate({ orders: 2000, seed: 3 });
  const r = buildReport(d.orders, d.products, { topN: 2 });
  assert.ok(r.categories.length > 0);
});
