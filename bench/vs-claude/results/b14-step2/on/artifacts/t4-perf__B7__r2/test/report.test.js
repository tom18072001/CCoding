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

// So sánh với bản gốc (test/report.legacy.js, chỉ dùng làm đặc tả)
const legacy = require('./report.legacy');
test('giống hệt bản gốc trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 4 }, { from: '2030-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 100 + seed * 400, products: 5 + seed * 7, customers: 3 + seed * 5, seed });
    if (seed % 3 === 0) d.products.push({ ...d.products[0], name: 'trùng sku', category: 'Khác' }); // sku trùng: lấy bản đầu
    if (seed % 4 === 0) d.orders.forEach((o, i) => { if (i % 7 === 0) o.unitPrice = 0; });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy.buildReport(d.orders, d.products, o));
  }
  assert.deepStrictEqual(buildReport([], [], {}), legacy.buildReport([], [], {}));
});
