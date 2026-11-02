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

test('giống hệt bản cũ (reference) trên nhiều bộ dữ liệu', () => {
  const ref = require('./report.reference');
  const opts = [{}, { topN: 1 }, { topN: 0 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-02' }, { from: '2026-01' }];
  for (let seed = 1; seed <= 6; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 30, seed });
    for (const o of opts) assert.deepStrictEqual(buildReport(d.orders, d.products, o), ref.buildReport(d.orders, d.products, o));
  }
  // trường hợp lạ: qty 0 hoàn tiền (-0), sku trùng, sku không rõ, đầu vào rỗng
  const products = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'A', name: 'dup', category: 'Y' }];
  const orders = [
    { id: 1, customerId: 'c', sku: 'A', qty: 0, unitPrice: 100, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 1, customerId: 'c', sku: 'Z', qty: 2, unitPrice: 100, date: '2025-01-01T23:00:00-05:00', status: 'paid' },
  ];
  assert.deepStrictEqual(buildReport(orders, products), ref.buildReport(orders, products));
  assert.deepStrictEqual(buildReport([], []), ref.buildReport([], []));
});
