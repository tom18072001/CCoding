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

const { buildReportLegacy } = require('./helpers/report.legacy');

test('giống hệt bản cũ trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [{}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2030-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500 + seed * 37, products: 5 + seed * 7, customers: 4 + seed * 11, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), buildReportLegacy(d.orders, d.products, o));
  }
});

test('giống bản cũ với trường hợp biên (sku trùng, hoàn tiền 0, giá trị lạ, rỗng)', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Hai', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'),
    mk('2', 'c', 'B', 2, 100, '2025-01-31T23:59:59-05:00', 'paid'),
    mk('3', 'd', 'C', 1, 100, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('4', 'd', 'Z', 3, -50, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'e', 'A', NaN, 5, '2025-03-10T00:00:00Z', 'paid'),
    mk('6', 'e', 'B', 1, 100, '2025-03-10T00:00:00Z', 'weird'),
    mk('7', undefined, 'B', 1, 100, '2025-03-10T00:00:00Z', 'refunded'),
    mk('8', 'f', 'B', 1, 100, '2025-03-10T00:00:00Z', 'cancelled'),
    mk('2', 'c', 'B', 1, 100, '2025-04-10T00:00:00Z', 'paid'),
  ];
  for (const o of [{}, { topN: 5 }, { from: '2025-02' }, { to: '2025-02' }]) {
    assert.deepStrictEqual(buildReport(orders, products, o), buildReportLegacy(orders, products, o));
  }
  assert.deepStrictEqual(buildReport([], products), buildReportLegacy([], products));
  assert.throws(() => buildReport([mk('x', 'c', 'A', 1, 1, 'bad', 'paid')], products), RangeError);
});

test('giống bản cũ với kiểu dữ liệu lạ (qty undefined/chuỗi, -0, NaN, sku NaN)', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: NaN, name: 'Nan', category: 'N' },
    { sku: 0, name: 'Zero', category: 'Z' },
    { sku: 'S', name: NaN, category: NaN },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, status, date = '2025-01-05T00:00:00Z') => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', undefined, 10, 'paid'),
    mk('2', 'c', 'A', '2', 10, 'paid'),
    mk('3', 'c', 'A', '3', 10, 'refunded'),
    mk('4', 'c', 'A', null, 10, 'paid'),
    mk(-0, -0, 'A', 1, 10, 'paid'),
    mk(0, 0, 'A', 1, 10, 'paid'),
    mk(NaN, NaN, 'A', 1, 10, 'paid'),
    mk(NaN, NaN, NaN, 1, 10, 'paid'),
    mk('5', 'd', -0, 1, 10, 'paid'),
    mk('6', 'd', 0, 2, 10, 'refunded'),
    mk('7', 'd', 'S', 1, 10, 'paid'),
    mk('8', 'd', 'A', 0, 10, 'refunded'),
    mk('9', undefined, 'A', Infinity, 10, 'paid'),
    mk('10', 'd', 'A', 1, '5', 'paid', '2025-02-03T00:00:00Z'),
    mk('11', 'd', 'A', true, 10, 'paid', '2025-02-03T00:00:00Z'),
  ];
  for (const o of [{}, { topN: 10 }, { from: '2025-02' }, { to: '2025-01', topN: 1 }]) {
    assert.deepStrictEqual(buildReport(orders, products, o), buildReportLegacy(orders, products, o));
  }
  // từng dòng riêng lẻ
  for (const r of orders) assert.deepStrictEqual(buildReport([r], products), buildReportLegacy([r], products));
});

test('giống bản cũ trên seed lớn có trộn status và option', () => {
  for (const seed of [101, 202, 303]) {
    const d = generate({ orders: 20000, seed });
    for (const o of [{}, { topN: 7 }, { from: '2025-04', to: '2025-08', topN: 1 }]) {
      assert.deepStrictEqual(buildReport(d.orders, d.products, o), buildReportLegacy(d.orders, d.products, o));
    }
  }
});
