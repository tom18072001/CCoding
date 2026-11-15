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

// ---- So sánh với bản cũ (đặc tả) ----
const { buildReport: legacy } = require('./legacy-report');

function same(orders, products, options) {
  assert.deepStrictEqual(buildReport(orders, products, options), legacy(orders, products, options));
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 50, seed });
    same(d.orders, d.products, undefined);
    same(d.orders, d.products, { topN: 5 });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { topN: 1, from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-12' });
    same(d.orders, d.products, { to: '2025-01' });
    same(d.orders, d.products, { from: '2030-01' });
  }
});

test('giống bản cũ ở các trường hợp biên', () => {
  same([], [], {});
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' }, // sku trùng: lấy cái đầu
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'C', name: 'Hòa', category: 'Z' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'k1', 'A', 2, 100, '2025-01-31T23:30:00-02:00', 'paid'),
    mk('1', 'k1', 'B', 2, 100, '2025-01-31T23:30:00-02:00', 'paid'),
    mk('2', 'k2', 'B', 2, 100, '2025-01-10T00:00:00Z', 'refunded'),
    mk('3', 'k2', 'NOPE', 1, 300, '2025-02-10T00:00:00Z', 'paid'),
    mk('4', 'k3', 'C', 0, 300, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'k3', 'C', -3, 300, '2025-03-10T00:00:00Z', 'paid'), // qty âm
    mk('6', 'k4', 'A', 1, 100, '2025-03-10T00:00:00Z', 'weird'),
    mk('7', 'k5', 'B', 1, 100, '2025-03-10T00:00:00Z', 'paid'),
    mk('7', 'k5', 'B', 1, 100, '2025-03-10T00:00:00Z', 'paid'), // trùng dòng
    mk('8', 'k6', 'A', 1, 100, '2025-03-10T00:00:00Z', 'cancelled'),
    mk('9', 'k1', 'B', 1, 100, '2026-03-10T00:00:00Z', 'refunded'),
  ];
  for (const opt of [{}, { topN: 1 }, { topN: 10 }, { from: '2025-02' }, { to: '2025-02' }, { from: '2025-02', to: '2025-02' }]) same(orders, products, opt);
  const tie = [mk('a', 'z', 'B', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('b', 'y', 'A', 1, 100, '2025-01-01T00:00:00Z', 'paid')];
  same(tie, products, { topN: 5 });
  // tổng bằng 0 -> share = 0
  same([mk('a', 'z', 'B', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('b', 'z', 'B', 1, 100, '2025-01-01T00:00:00Z', 'refunded')], products);
  same(orders, []);
  // đầu vào không bị sửa
  const copy = JSON.parse(JSON.stringify(orders));
  buildReport(orders, products);
  assert.deepStrictEqual(orders, copy);
});

test('hiệu năng: 200.000 dòng dưới 1 giây', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = process.hrtime.bigint();
  const r = buildReport(d.orders, d.products, { topN: 5 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(r.categories.length > 0);
  assert.ok(ms < 1000, `quá chậm: ${ms} ms`);
});

test('giống bản cũ với giá trị không hữu hạn, -0 và ngày không hợp lệ', () => {
  const legacy = require('./legacy-report').buildReport;
  const prods = [{ sku: 'A', name: 'Trà', category: 'X' }, { sku: 'A', name: 'Trùng', category: 'Y' }];
  const base = { id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 10, date: '2025-01-05T10:00:00Z', status: 'paid' };
  const orders = [
    base,
    { ...base, id: 'o2', unitPrice: NaN },
    { ...base, id: 'o3', qty: Infinity, status: 'refunded' },
    { ...base, id: 'o4', qty: 0, status: 'refunded' }, // -0
    { ...base, id: 'o5', sku: 'ZZ', status: 'weird' },
  ];
  assert.deepStrictEqual(buildReport(orders, prods), legacy(orders, prods));
  const bad = [{ ...base, date: 'khong-hop-le' }];
  assert.throws(() => legacy(bad, prods), RangeError);
  assert.throws(() => buildReport(bad, prods), RangeError);
});
