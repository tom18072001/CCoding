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
  const { buildReport: ref } = require('./report.reference');
  const cases = [
    [{ orders: 3000, products: 50, customers: 40, seed: 1 }, { topN: 5 }],
    [{ orders: 5000, products: 300, customers: 500, seed: 7 }, {}],
    [{ orders: 4000, products: 20, customers: 10, seed: 9 }, { topN: 0 }],
    [{ orders: 4000, products: 100, customers: 100, seed: 11 }, { from: '2025-03', to: '2025-09', topN: 2 }],
    [{ orders: 2000, products: 100, customers: 100, seed: 12 }, { from: '2026-01' }],
    [{ orders: 2000, products: 100, customers: 100, seed: 13 }, { to: '2025-01' }],
    [{ orders: 0 }, {}],
  ];
  for (const [g, o] of cases) {
    const d = generate(g);
    assert.deepStrictEqual(buildReport(d.orders, d.products, o), ref(d.orders, d.products, o));
  }
  // SKU trùng, qty 0, hoàn tiền, dòng âm, không có sản phẩm
  const products = [{ sku: 'A', name: 'x', category: 'K' }, { sku: 'A', name: 'y', category: 'Z' }, { sku: 'B', name: 'b', category: 'K' }];
  const orders = [
    { id: 1, customerId: 'a', sku: 'A', qty: 0, unitPrice: 5, date: '2025-01-31T23:00:00-05:00', status: 'refunded' },
    { id: 1, customerId: 'a', sku: 'B', qty: 2, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'paid' },
    { id: '1', customerId: 'b', sku: 'B', qty: -2, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'paid' },
    { id: 2, customerId: 'b', sku: 'Q', qty: 3, unitPrice: 5, date: '2025-02-01T00:00:00+07:00', status: 'refunded' },
    { id: 3, customerId: 'c', sku: 'B', qty: 1, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'cancelled' },
  ];
  for (const o of [{}, { topN: 1 }, { from: '2025-02' }]) assert.deepStrictEqual(buildReport(orders, products, o), ref(orders, products, o));
});

test('giống hệt bản cũ trên các trường hợp biên', () => {
  const { buildReport: ref } = require('./report.reference');
  const products = [
    { sku: 'A', name: 'a', category: 'K' },
    { sku: 'B', name: 'b', category: 'K' },
    { sku: 'C', name: 'c', category: 'Z' },
    { sku: 'D', name: 'd', category: 'Z' },
    { sku: 'E', name: 'e', category: 'Z' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const D = '2025-03-10T00:00:00Z';
  const orders = [
    mk(1, 'a', 'A', Infinity, 5, D, 'paid'),
    mk(2, NaN, 'B', 2, 5, D, 'paid'),
    mk(3, NaN, 'B', 2, 5, D, 'refunded'),
    mk(NaN, Infinity, 'C', 1, 5, D, 'paid'),
    mk(-0, -0, 'C', 0, 5, D, 'refunded'),
    mk(0, 0, 'D', 3, -Infinity, D, 'paid'),
    mk('', '', 'D', 3, 7, D, 'paid'),
    mk(undefined, undefined, 'E', 2, 9, D, 'paid'),
    mk(5, null, 'E', null, 9, D, 'paid'),
    mk(6, 'q', 'A', undefined, 9, D, 'paid'),
    mk(6, 'q', 'A', undefined, 9, D, 'refunded'),
    mk(7, 'q', 'B', '2', 4, D, 'paid'),
    mk(7, 'q', 'B', '3', 4, D, 'refunded'),
    mk(8, 'r', undefined, 2, 4, D, 'paid'),
    mk(8, 'r', NaN, 2, 4, D, 'paid'),
    mk(9, 'r', 'A', 1, undefined, D, 'paid'),
    mk(10, 'r', 'A', 1, null, D, 'paid'),
    // ranh giới from/to và múi giờ lẻ
    mk(11, 'b', 'A', 1, 10, '2025-02-28T23:59:59.999Z', 'paid'),
    mk(12, 'b', 'A', 1, 10, '2025-03-01T00:00:00Z', 'paid'),
    mk(13, 'b', 'B', 1, 10, '2025-03-31T23:59:59.999Z', 'paid'),
    mk(14, 'b', 'B', 1, 10, '2025-04-01T00:00:00Z', 'paid'),
    mk(15, 'c', 'C', 1, 10, '2025-04-01T00:00:00+05:45', 'paid'),
    mk(16, 'c', 'C', 1, 10, '2025-03-31T23:59:00-03:30', 'paid'),
    mk(17, 'c', 'C', 1, 10, '2025-03-01T00:00:00+05:30', 'refunded'),
  ];
  const opts = [{}, { topN: 100 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-03' }, { from: '2025-03', to: '2025-03' }, { from: '2025-04', to: '2025-03' }, { from: '2025-02', to: '2025-02' }];
  for (const o of opts) {
    assert.deepStrictEqual(buildReport(orders, products, o), ref(orders, products, o));
    assert.deepStrictEqual(buildReport(orders, [], o), ref(orders, [], o));
  }
  assert.deepStrictEqual(buildReport([], products, {}), ref([], products, {}));
  assert.deepStrictEqual(buildReport([], [], {}), ref([], [], {}));
  // ngày không hợp lệ: cùng RangeError
  const bad = [mk(1, 'a', 'A', 1, 1, D, 'paid'), mk(2, 'a', 'A', 1, 1, 'không phải ngày', 'cancelled')];
  assert.throws(() => ref(bad, products), RangeError);
  assert.throws(() => buildReport(bad, products), RangeError);
});

test('không giữ cache giữa các lần gọi', () => {
  const p = [{ sku: 'A', name: 'a', category: 'K' }];
  const o1 = [{ id: 1, customerId: 'a', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'paid' }];
  const o2 = [{ id: 1, customerId: 'a', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'paid' }];
  const r1 = buildReport(o1, p);
  r1.months.push('x');
  assert.deepStrictEqual(buildReport(o2, p).months, ['2025-01']);
});
