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

test('giống hệt bản cũ trên nhiều bộ dữ liệu', () => {
  const ref = require('./reference-report').buildReport;
  const optsList = [{}, { topN: 1 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-02', topN: 0 }, { from: '2030-01' }];
  for (const seed of [1, 2, 3, 7, 11]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    // sku lạ, sản phẩm trùng sku, trạng thái lạ, qty 0, giá âm
    d.products.push({ sku: d.products[0].sku, name: 'trùng', category: 'Khác' });
    d.orders.push({ id: 'x1', customerId: 'cx', sku: 'NOPE', qty: 0, unitPrice: 5, date: '2025-04-01T00:00:00Z', status: 'refunded' });
    d.orders.push({ id: 'x2', customerId: 'cx', sku: 'NOPE', qty: 2, unitPrice: -5, date: '2025-04-01T00:00:00Z', status: 'paid' });
    d.orders.push({ id: 'x3', customerId: 'cy', sku: 'NOPE', qty: 2, unitPrice: 5, date: '2025-04-01T00:00:00Z', status: 'weird' });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), ref(d.orders, d.products, o));
  }
  assert.deepStrictEqual(buildReport([], [], {}), ref([], [], {}));
});

test('ca biên: giống hệt bản cũ (kể cả -0, kiểu lẫn lộn, lỗi)', () => {
  const ref = require('./reference-report').buildReport;
  const P = [{ sku: 'A', name: 'Trà', category: 'X' }, { sku: 'A', name: 'Dup', category: 'Y' }, { sku: 'B', name: 'Bút', category: 'Y' }];
  const mk = (o) => ({ id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-03-10T00:00:00Z', status: 'paid', ...o });
  const same = (orders, products = P, opts = {}) => {
    const a = buildReport(orders, products, opts);
    const b = ref(orders, products, opts);
    assert.deepStrictEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    return a;
  };
  // refunded qty 0 -> -0 phải thành 0
  const r0 = same([mk({ status: 'refunded', qty: 0 }), mk({ sku: 'B', status: 'refunded', qty: 0, unitPrice: 0 })]);
  assert.ok(Object.is(r0.grandTotal, 0));
  same([mk({ status: 'refunded', qty: 0 })], P, { topN: 5 });
  same([mk({ status: 'refunded', qty: 0, sku: 'B' })]);
  // id/customerId lẫn số/chuỗi
  same([mk({ id: 1, customerId: 1 }), mk({ id: '1', customerId: '1' }), mk({ id: 1, customerId: '1' }), mk({ id: 2, customerId: 2 })]);
  // paid giá âm, status lạ, sku trùng, sku lạ
  same([mk({ unitPrice: -50 }), mk({ status: 'weird' }), mk({ sku: 'ZZ' }), mk({ sku: 'B', qty: 3 }), mk({ status: 'refunded', sku: 'B' })]);
  // options
  const rows = [mk({ date: '2025-01-05T00:00:00Z' }), mk({ date: '2025-06-05T00:00:00+07:00' }), mk({ date: '2025-12-31T20:00:00-05:00' }), mk({ date: '2025-06-30T23:59:59Z', sku: 'B' })];
  for (const o of [{ from: '2025-06', to: '2025-06' }, { from: '2025-09', to: '2025-02' }, { topN: 0 }, { topN: null }, { topN: 1, from: '', to: '' }, { from: '2026-01' }, { to: '2024-01' }]) same(rows, P, o);
  // ngày không hợp lệ
  for (const bad of ['không phải ngày', undefined, '']) {
    const orders = [mk(), mk({ date: bad })];
    let ea, eb;
    try { buildReport(orders, P); } catch (e) { ea = e; }
    try { ref(orders, P); } catch (e) { eb = e; }
    assert.ok(ea && eb);
    assert.equal(ea.constructor, eb.constructor);
    assert.equal(ea.message, eb.message);
  }
  // rỗng
  same([]);
  same([mk({ status: 'cancelled' })]);
  // dữ liệu sinh, nhiều seed
  for (let seed = 20; seed < 30; seed++) {
    const d = generate({ orders: 2500, products: 30, customers: 40, seed });
    same(d.orders, d.products, { topN: seed % 4 });
  }
});
