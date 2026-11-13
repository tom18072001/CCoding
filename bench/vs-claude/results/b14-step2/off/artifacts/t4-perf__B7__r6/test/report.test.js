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

test('giống hệt bản cũ trên nhiều bộ dữ liệu và tuỳ chọn', () => {
  const legacy = require('./fixtures/report.legacy').buildReport;
  const optsList = [{}, { topN: 1 }, { topN: 0 }, { topN: 5, from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-11', topN: 4 }, { from: '2026-01' }];
  for (const seed of [1, 2, 3, 7, 11]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    // sku trùng trong products (bản cũ lấy phần tử đầu)
    const products = d.products.concat([{ sku: d.products[0].sku, name: 'trùng', category: 'Khác' }]);
    for (const o of optsList) {
      assert.deepStrictEqual(buildReport(d.orders, products, o), legacy(d.orders, products, o));
    }
  }
  assert.deepStrictEqual(buildReport([], []), legacy([], []));
  const odd = [{ id: 1, customerId: 'x', sku: 'Z', qty: 0, unitPrice: 0, date: '2025-01-01T00:00:00Z', status: 'refunded' }];
  assert.deepStrictEqual(buildReport(odd, []), legacy(odd, []));
});
