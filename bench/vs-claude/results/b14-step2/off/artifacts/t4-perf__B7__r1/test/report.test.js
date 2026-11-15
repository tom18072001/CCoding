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

// ---- So sánh với bản cũ (test/report.legacy.js là đặc tả) ----
const legacy = require('./report.legacy');

function same(orders, products, opts) {
  assert.deepStrictEqual(buildReport(orders, products, opts), legacy.buildReport(orders, products, opts));
}

test('giống bản cũ trên nhiều bộ dữ liệu sinh và tuỳ chọn', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 50, seed });
    for (const opts of [undefined, { topN: 1 }, { topN: 0 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-12' }, { to: '2025-01' }, { from: '2030-01' }]) {
      same(d.orders, d.products, opts);
    }
  }
});

test('giống bản cũ với hành vi lạ: sku trùng, hoàn tiền, qty âm/0, trạng thái lạ, rỗng', () => {
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trà 2', category: 'Y' },
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'C', name: 'Nhãn', category: 'Z' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'a', 'A', 2, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('1', 'a', 'B', 0, 100, '2025-02-01T00:00:00Z', 'refunded'),
    mk('2', 'b', 'B', -3, 100, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('3', 'b', 'C', 1, 100, '2025-02-10T00:00:00Z', 'weird'),
    mk('4', 'c', 'ZZ', 5, 7, '2025-02-11T00:00:00Z', 'paid'),
    mk('5', 'c', 'B', 3, 100, '2025-03-11T00:00:00Z', 'refunded'),
    mk('6', 'd', 'C', 1, 100, '2025-03-11T00:00:00Z', 'paid'),
    mk('7', 'e', 'C', 1, 100, '2025-03-11T00:00:00Z', 'cancelled'),
    mk('8', 'f', 'B', 1, 100, '2025-03-11T00:00:00Z', 'paid'),
    mk('9', 'f', 'B', 1, 100, '2025-03-12T00:00:00Z', 'paid'),
  ];
  same(orders, products);
  same(orders, products, { topN: 1, from: '2025-02', to: '2025-02' });
  same([], products);
  same([mk('x', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'cancelled')], products);
  same([mk('x', 'c', 'B', 1, 0, '2025-01-01T00:00:00Z', 'paid'), mk('y', 'd', 'A', 1, 0, '2025-01-01T00:00:00Z', 'paid')], products);
  assert.throws(() => buildReport([mk('x', 'c', 'A', 1, 5, 'bad', 'paid')], products), RangeError);
});
