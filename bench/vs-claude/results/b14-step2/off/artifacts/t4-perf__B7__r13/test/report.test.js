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

// ---- So sánh với bản cũ (test/fixtures/report.legacy.js là đặc tả) ----
const legacy = require('./fixtures/report.legacy').buildReport;

function same(orders, products, opts) {
  const a = legacy(orders, products, opts);
  const b = buildReport(orders, products, opts);
  assert.equal(JSON.stringify(b), JSON.stringify(a)); // cùng giá trị, cùng thứ tự khóa/mảng
  assert.deepEqual(b, a);
}

test('so với bản cũ: dữ liệu sinh ngẫu nhiên, nhiều seed/tùy chọn', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    same(d.orders, d.products, {});
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { topN: 5, from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-06' });
    same(d.orders, d.products, { to: '2025-02' });
    same(d.orders, d.products, { from: '2030-01' });
  }
});

test('so với bản cũ: trường hợp biên', () => {
  same([], [], {});
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Hai', category: 'X' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:30:00-05:00', 'refunded'),
    mk('1', 'c', 'B', 2, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('2', 'd', 'B', 2, 100, '2025-02-01T00:00:00+07:00', 'refunded'),
    mk('3', 'd', 'ZZ', 1, 5, '2025-02-10T00:00:00Z', 'paid'),
    mk('4', 'e', 'ZZ', 1, 5, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'e', 'B', 1, 100, '2025-03-10T00:00:00Z', 'cancelled'),
    mk('6', 'f', 'B', 1, NaN, '2025-03-10T00:00:00Z', 'paid'),
    mk('7', 'g', 'A', 1, 0, '2025-04-10T00:00:00Z', 'paid'),
  ];
  same(orders, products, {});
  same(orders, products, { topN: 1 });
  same(orders.filter((o) => o.status === 'refunded'), products, {});
  same(orders, [], {});
  assert.throws(() => buildReport([{ ...orders[0], date: 'bad' }], products), RangeError);
});
