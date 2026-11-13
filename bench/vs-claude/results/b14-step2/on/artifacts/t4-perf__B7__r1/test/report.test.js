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
const legacy = require('./fixtures/report.legacy');

test('giống hệt bản cũ trên dữ liệu sinh', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    const opts = [{}, { topN: 1 }, { topN: 0 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-11' }, { to: '2025-02' }, { from: '2030-01' }];
    for (const opt of opts) {
      assert.deepStrictEqual(buildReport(d.orders, d.products, opt), legacy.buildReport(d.orders, d.products, opt));
    }
  }
});

test('giống hệt bản cũ với trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'C', name: 'Không danh mục' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'a', 'A', 2, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('1', 'a', 'B', 1, 0, '2025-01-01T00:00:00Z', 'refunded'),
    mk('2', 'b', 'Z', 3, 50, '2025-02-01T00:00:00+07:00', 'refunded'),
    mk('3', 'b', 'C', 1, 70, '2025-02-10T00:00:00Z', 'paid'),
    mk('4', 'c', 'B', 1, 10, '2025-02-10T00:00:00Z', 'cancelled'),
    mk('5', 'c', 'A', 1, -30, '2025-03-10T00:00:00Z', 'paid'),
    mk('6', 'd', 'B', 2, 100, '2025-03-10T00:00:00Z', 'paid'),
    mk('7', 'e', 'B', 2, 100, '2025-03-10T00:00:00Z', 'paid'),
    mk('8', 'f', 'A', 2, 100, '2025-03-10T00:00:00Z', 'refunded'),
    mk('9', undefined, 'A', 1, 1, '2025-04-10T00:00:00Z', 'paid'),
    mk('10', 'g', 'A', NaN, 5, '2025-04-10T00:00:00Z', 'paid'),
    mk('11', 'g', 'A', 1, Infinity, '2025-04-11T00:00:00Z', 'refunded'),
    mk('12', 'h', 'B', 1.5, 0.1, '2025-04-11T00:00:00Z', 'paid'),
  ];
  const cases = [[orders, products, {}], [orders, products, { topN: 1 }], [orders, products, { from: '2025-02', to: '2025-03' }], [[], products, {}], [[], [], { topN: 2 }]];
  for (const [o, p, opt] of cases) assert.deepStrictEqual(buildReport(o, p, opt), legacy.buildReport(o, p, opt));
  const copy = JSON.stringify(orders);
  buildReport(orders, products);
  assert.equal(JSON.stringify(orders), copy);
  const bad = [mk('x', 'a', 'A', 1, 1, 'không-phải-ngày', 'paid')];
  assert.throws(() => legacy.buildReport(bad, products), RangeError);
  assert.throws(() => buildReport(bad, products), RangeError);
});

test('200.000 dòng dưới 1 giây; mẫu 20.000 dòng giống bản cũ', () => {
  const big = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = process.hrtime.bigint();
  buildReport(big.orders, big.products, { topN: 5 });
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 1000);
  const d = generate({ orders: 20000, products: 2000, customers: 3000, seed: 9 });
  assert.deepStrictEqual(buildReport(d.orders, d.products, { topN: 5 }), legacy.buildReport(d.orders, d.products, { topN: 5 }));
});
