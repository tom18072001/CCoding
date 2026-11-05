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

// So sánh với bản gốc (test/report.legacy.js) — bản gốc là đặc tả.
const legacy = require('./report.legacy');

function same(orders, products, options) {
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  assert.deepEqual(b, a);
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên, nhiều tùy chọn', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 25, seed });
    same(d.orders, d.products, {});
    same(d.orders, d.products, { topN: 1 });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { topN: 10 });
    same(d.orders, d.products, { from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-06' });
    same(d.orders, d.products, { to: '2025-02', topN: 2 });
    same(d.orders, d.products, { from: '2026-01' });
  }
});

test('giống bản cũ ở các trường hợp biên', () => {
  same([], [], {});
  const P = [
    { sku: 'A', name: 'A1', category: 'X' },
    { sku: 'A', name: 'A2', category: 'Y' }, // trùng sku: lấy cái đầu
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C', category: 'X' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const O = [
    mk('1', 'c1', 'A', 0, 100, '2025-01-31T23:30:00-05:00', 'refunded'), // -0
    mk('1', 'c1', 'B', 2, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('2', 'c2', 'B', 2, 100, '2025-01-01T00:00:00+07:00', 'paid'), // lệch tháng theo UTC
    mk('3', 'c2', 'C', 2, 100, '2025-03-01T00:00:00Z', 'refunded'),
    mk('4', 'c3', 'ZZ', 1, 50, '2025-03-02T00:00:00Z', 'paid'),
    mk('4', 'c3', 'ZZ', 1, 50, '2025-03-02T00:00:00Z', 'paid'),
    mk('5', 'c3', 'B', 3, 100, '2025-03-02T00:00:00Z', 'cancelled'),
    mk('6', 'c4', 'C', 1, 100, '2025-04-02T00:00:00Z', 'refunded'),
    mk('7', 'c5', 'B', 2, 100, '2025-04-02T00:00:00Z', 'paid'), // hòa doanh thu với c2/B
    mk('8', 'c6', 'B', 2, 100, '2025-04-02T00:00:00Z', 'paid'),
  ];
  for (const opt of [{}, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }, { from: '2025-03', to: '2025-03' }, { topN: 0 }]) same(O, P, opt);
  same(O.filter((o) => o.status !== 'paid'), P, {});
  same(O.filter((o) => o.status === 'refunded'), P, {});
  same(O, [], {});
  same([mk('1', 'c1', 'A', 0, 0, '2025-01-01T00:00:00Z', 'paid')], P, {}); // grandTotal = 0
  assert.throws(() => buildReport([mk('1', 'c', 'A', 1, 1, 'không phải ngày', 'paid')], P));
});
