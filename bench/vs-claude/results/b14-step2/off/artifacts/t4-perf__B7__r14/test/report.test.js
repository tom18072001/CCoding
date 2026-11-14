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
  const ref = require('./report.reference').buildReport;
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-11', topN: 4 }];
  for (let seed = 1; seed <= 5; seed++) {
    const d = generate({ orders: 700, products: 30 + seed * 5, customers: 40, seed });
    // ép trùng sku sản phẩm, đơn có qty âm/0 để kiểm tra hành vi lạ
    d.products.push({ sku: d.products[0].sku, name: 'trùng', category: 'Khác' }, { sku: 'X', name: 'unknown thật', category: 'unknown' });
    d.orders.forEach((o, i) => {
      if (i % 97 === 0) o.qty = 0;
      if (i % 131 === 0) o.qty = -o.qty;
      if (i % 53 === 0) o.sku = 'X';
    });
    const snapshot = JSON.stringify(d);
    for (const opt of optsList) {
      const got = buildReport(d.orders, d.products, opt);
      const want = ref(d.orders, d.products, opt);
      assert.deepEqual(got, want);
      assert.equal(JSON.stringify(got), JSON.stringify(want));
    }
    assert.equal(JSON.stringify(d), snapshot);
  }
  assert.deepEqual(buildReport([], [], {}), ref([], [], {}));
  assert.throws(() => buildReport([{ date: 'x' }], []), RangeError);
});

test('NaN/Infinity/-0 và sku NaN giống bản cũ', () => {
  const ref = require('./report.reference').buildReport;
  const products = [{ sku: NaN, name: 'n', category: 'C' }, { sku: 'A', name: 'a', category: 'C' }];
  const orders = [
    { id: 1, customerId: 'c', sku: NaN, qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' },
    { id: 2, customerId: 'c', sku: 'A', qty: Infinity, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 3, customerId: 'd', sku: 'A', qty: -0, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'paid' },
  ];
  assert.deepEqual(buildReport(orders, products), ref(orders, products));
});
