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

test('giống hệt bản cũ (legacy) trên nhiều bộ dữ liệu', () => {
  const legacy = require('./report.legacy').buildReport;
  const cases = [
    [{ orders: 3000, seed: 1 }, {}],
    [{ orders: 3000, seed: 7, products: 30, customers: 20 }, { topN: 1, from: '2025-03', to: '2025-09' }],
    [{ orders: 2000, seed: 9 }, { topN: 0, from: '2025-12' }],
    [{ orders: 2000, seed: 11 }, { to: '2025-01', topN: 10 }],
    [{ orders: 1500, seed: 5 }, { from: '2030-01' }],
    [{ orders: 0, seed: 5 }, {}],
  ];
  for (const [g, opt] of cases) {
    const d = generate(g);
    assert.deepEqual(buildReport(d.orders, d.products, opt), legacy(d.orders, d.products, opt));
    assert.equal(JSON.stringify(buildReport(d.orders, d.products, opt)), JSON.stringify(legacy(d.orders, d.products, opt)));
  }
  // trường hợp biên: sku trùng, hoàn tiền giá 0, hòa điểm
  const products = [{ sku: 'A', name: 'x', category: 'C' }, { sku: 'A', name: 'y', category: 'D' }];
  const orders = [
    { id: 1, customerId: 'a', sku: 'A', qty: 0, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 2, customerId: 'b', sku: 'Z', qty: 1, unitPrice: 5, date: '2025-01-31T23:00:00-05:00', status: 'paid' },
    { id: 2, customerId: 'b', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-31T23:00:00-05:00', status: 'paid' },
  ];
  assert.deepEqual(buildReport(orders, products), legacy(orders, products));
  assert.equal(JSON.stringify(buildReport(orders, products)), JSON.stringify(legacy(orders, products)));
});
