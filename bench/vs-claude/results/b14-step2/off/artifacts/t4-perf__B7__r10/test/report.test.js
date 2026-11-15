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

const legacy = require('./fixtures/report.legacy');

test('giống hệt bản cũ trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [{}, { topN: 1 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-09', topN: 5 }, { from: '2025-02', to: '2025-04' }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 150, products: 5 + seed * 7, customers: 4 + seed * 9, seed });
    for (const o of optsList) {
      assert.deepEqual(buildReport(d.orders, d.products, o), legacy.buildReport(d.orders, d.products, o));
      assert.equal(JSON.stringify(buildReport(d.orders, d.products, o)), JSON.stringify(legacy.buildReport(d.orders, d.products, o)));
    }
  }
});

test('giống bản cũ ở các trường hợp biên', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'A', name: 'dup', category: 'Y' }, { sku: 'B', name: 'b', category: 'X' }];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:59:59-05:00', 'refunded'),
    mk('1', 'c', 'B', 2, 0, '2025-02-01T00:00:00Z', 'refunded'),
    mk('2', 'd', 'B', 3, 50, '2025-02-01T00:00:00Z', 'paid'),
    mk('3', 'd', 'Z', 1, 10, '2025-03-01T00:00:00+07:00', 'paid'),
    mk('4', 'e', 'B', 1, 50, '2025-03-01T00:00:00Z', 'paid'),
    mk('4', 'e', 'B', 1, 50, '2025-03-01T00:00:00Z', 'paid'),
  ];
  for (const o of [{}, { topN: 0 }, { from: '2025-02' }]) {
    assert.deepEqual(buildReport(orders, products, o), legacy.buildReport(orders, products, o));
  }
  assert.deepEqual(buildReport([], products), legacy.buildReport([], products));
  assert.throws(() => buildReport([mk('1', 'c', 'A', 1, 1, 'bad', 'paid')], products), RangeError);
});

test('fuzz đối chiếu bản cũ: giá trị lạ, múi giờ, tùy chọn, thứ tự hòa', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const qtys = [1, 2, 3, 0, -1, -2, 5, NaN, Infinity, -Infinity, -0, 0.1, 0.2, 0.3, 1e-9];
  const prices = [100, 250, 0, -0, NaN, Infinity, 0.1, 0.2, 0.7, 1e-7, 1e15, 999];
  const statuses = ['paid', 'paid', 'refunded', 'cancelled', 'pending', 'weird', undefined, null, ''];
  const dates = [
    '2025-01-31T23:30:00-05:00', '2025-02-01T00:00:00Z', '2025-02-15', '2025-03-01T00:00:00+07:00',
    '2025-03-31T23:59:59.999Z', '2025-04-10T12:00:00Z', new Date('2025-05-05T05:05:05Z'), new Date(Date.UTC(2025, 5, 30, 23, 59)),
    '2025-06-01T00:00:00.000+00:00', '2024-12-31T23:59:59-11:00',
  ];
  const cats = ['A', 'B', undefined, null, '', 'unknown'];
  const names = ['n', undefined, null, 'x'];
  const optsList = [{}, { topN: 1 }, { topN: 100 }, { topN: 0 }, { from: '2025-02' }, { to: '2025-03' },
    { from: '2025-02', to: '2025-04', topN: 2 }, { from: '2025-05', to: '2025-02' }, { from: '2030-01' }, { to: '1999-01' }];
  for (let iter = 0; iter < 60; iter++) {
    const nSku = iter % 5 === 0 ? 150 : 1 + Math.floor(rnd() * 8);
    const products = [];
    for (let i = 0; i < nSku; i++) {
      if (rnd() < 0.8) products.push({ sku: 'S' + (i % 120), name: pick(names), category: pick(cats) });
    }
    if (iter % 7 === 0) products.push({ sku: undefined, name: 'u', category: 'U' }, { sku: NaN, name: 'nan', category: 'N' });
    const orders = [];
    const n = 20 + Math.floor(rnd() * 150);
    for (let i = 0; i < n; i++) {
      const o = {
        id: rnd() < 0.1 ? undefined : 'o' + Math.floor(rnd() * 12),
        customerId: rnd() < 0.1 ? undefined : 'c' + Math.floor(rnd() * 8),
        sku: rnd() < 0.05 ? undefined : rnd() < 0.03 ? NaN : 'S' + Math.floor(rnd() * (nSku + 3)),
        qty: pick(qtys),
        unitPrice: pick(prices),
        date: pick(dates),
        status: pick(statuses),
      };
      if (rnd() < 0.05) delete o.status;
      orders.push(o);
    }
    for (const o of optsList) {
      const a = buildReport(orders, products, o);
      const b = legacy.buildReport(orders, products, o);
      assert.deepEqual(a, b, `iter ${iter} opts ${JSON.stringify(o)}`);
      assert.equal(JSON.stringify(a), JSON.stringify(b), `json iter ${iter}`);
      assert.deepEqual(Object.keys(a.categories.map((c) => c.byMonth)), Object.keys(b.categories.map((c) => c.byMonth)));
    }
  }
});
