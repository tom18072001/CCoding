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

test('giống hệt bản cũ (so sánh với test/report.reference.js)', () => {
  const ref = require('./report.reference');
  const cases = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const d = generate({ orders: 3000, products: 40, customers: 30, seed });
    cases.push([d.orders, d.products, {}]);
    cases.push([d.orders, d.products, { topN: 1, from: '2025-03', to: '2025-09' }]);
    cases.push([d.orders, d.products.slice(0, 10), { topN: 5, from: '2025-06' }]);
    cases.push([d.orders, d.products, { topN: 0, to: '2025-02' }]);
  }
  cases.push([[], [], {}]);
  const d = generate({ orders: 500, seed: 9 });
  cases.push([d.orders, [...d.products, { sku: d.products[0].sku, name: 'dup', category: 'X' }], {}]);
  cases.push([d.orders.map((o, i) => (i % 7 ? o : { ...o, unitPrice: 0 })), d.products, {}]);
  for (const [o, p, opt] of cases) assert.deepStrictEqual(buildReport(o, p, opt), ref.buildReport(o, p, opt));
});
