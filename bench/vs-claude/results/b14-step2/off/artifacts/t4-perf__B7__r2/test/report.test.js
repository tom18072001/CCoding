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

// So sánh với bản cũ (đặc tả) trên nhiều bộ dữ liệu
const { buildReport: legacy } = require('./report.legacy');

test('giống hệt bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 4 }, { from: '2025-09', to: '2025-02' }];
  for (let seed = 1; seed <= 6; seed++) {
    const d = generate({ orders: 3000, products: 40 + seed * 10, customers: 25 * seed, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o));
  }
  assert.deepStrictEqual(buildReport([], [], {}), legacy([], [], {}));
});

test('giống hệt bản cũ với trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'Z', name: 'Không loại' },
  ];
  const base = { customerId: 'c', date: '2025-01-31T23:30:00-05:00', status: 'paid' };
  const orders = [
    { ...base, id: 1, sku: 'A', qty: 0, unitPrice: 100, status: 'refunded' },
    { ...base, id: 1, sku: 'B', qty: 2, unitPrice: 100 },
    { ...base, id: 2, sku: 'B', qty: 2, unitPrice: 100, status: 'refunded', date: '2025-02-01T00:00:00Z' },
    { ...base, id: 3, sku: 'Z', qty: 1, unitPrice: 50, customerId: 'd' },
    { ...base, id: 4, sku: 'Q', qty: 1, unitPrice: 50, status: 'weird' },
    { ...base, id: 5, sku: 'B', qty: 1, unitPrice: NaN },
    { ...base, id: 6, sku: 'B', qty: 3, unitPrice: 100, status: 'cancelled', date: '2026-01-01T00:00:00Z' },
  ];
  for (const o of [{}, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }]) {
    assert.deepStrictEqual(buildReport(orders, products, o), legacy(orders, products, o));
  }
  const bad = [{ ...base, id: 1, sku: 'A', qty: 1, unitPrice: 1, status: 'cancelled', date: 'khong-hop-le' }];
  assert.throws(() => legacy(bad, products), RangeError);
  assert.throws(() => buildReport(bad, products), RangeError);
});
