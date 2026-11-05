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

// --- So sánh với bản cũ (test/report.legacy.js là đặc tả) ---
const legacy = require('./report.legacy');

function same(orders, products, opts) {
  assert.deepStrictEqual(buildReport(orders, products, opts), legacy.buildReport(orders, products, opts));
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 60, customers: 40, seed });
    same(d.orders, d.products);
    same(d.orders, d.products, { topN: 5 });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-11' });
    same(d.orders, d.products, { to: '2025-01', topN: 1 });
    same(d.orders, d.products, { from: '2026-01' });
  }
});

test('giống bản cũ ở các trường hợp biên', () => {
  same([], []);
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' }, // sku trùng: lấy bản đầu
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'N', name: 'Không loại' }, // thiếu category
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'),
    mk('1', 'c', 'B', 2, 100, '2025-01-31T23:59:59-05:00', 'paid'),
    mk('2', 'd', 'B', 2, 100, '2025-01-31T23:59:59-05:00', 'paid'),
    mk('3', 'd', 'Z', 1, 50, '2024-12-31T20:00:00Z', 'paid'),
    mk('4', 'e', 'N', 3, 10, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'e', 'A', 1, 100, '2025-02-10T00:00:00Z', 'refunded'),
    mk('6', 'f', 'A', 1, 100, '2025-02-10T00:00:00Z', 'cancelled'),
    mk('7', 'a', 'A', 1, 100, '2025-02-10T00:00:00Z', 'paid'),
    mk('8', 'b', 'A', 1, 100, '2025-02-10T00:00:00Z', 'paid'), // hòa doanh thu
    mk('9', 'g', 'B', 1, 0, '2025-03-10T00:00:00Z', 'paid'),
    mk('9', 'g', 'A', 1, 100, 1735689600000, 'paid'), // date là số
  ];
  same(orders, products);
  same(orders, products, { topN: 1, from: '2025-01', to: '2025-02' });
  same(orders, products, { topN: 10 });
  // tổng bằng 0 -> share = 0
  same([mk('1', 'c', 'A', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'A', 1, 100, '2025-01-02T00:00:00Z', 'refunded')], products);
  // qty/unitPrice không hợp lệ (NaN -> null qua JSON ở bản cũ)
  same([mk('1', 'c', 'A', undefined, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'B', 1, NaN, '2025-01-01T00:00:00Z', 'refunded')], products);
  // date không hợp lệ: cả hai cùng ném lỗi
  assert.throws(() => buildReport([mk('1', 'c', 'A', 1, 1, 'xx', 'paid')], products), RangeError);
  assert.throws(() => legacy.buildReport([mk('1', 'c', 'A', 1, 1, 'xx', 'paid')], products), RangeError);
});

test('không sửa đầu vào', () => {
  const d = generate({ orders: 500, seed: 9 });
  const snap = JSON.stringify(d);
  buildReport(d.orders, d.products);
  assert.equal(JSON.stringify(d), snap);
});
