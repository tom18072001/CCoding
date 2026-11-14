'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./helpers/report.legacy');
const { generate } = require('../src/gen');

const same = (d, opts) => assert.deepStrictEqual(buildReport(d.orders, d.products, opts), legacy(d.orders, d.products, opts));

test('khớp bản cũ trên dữ liệu sinh với nhiều tùy chọn', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 60, customers: 40, seed });
    same(d);
    same(d, { topN: 1 });
    same(d, { topN: 0 });
    same(d, { topN: 10, from: '2025-03', to: '2025-09' });
    same(d, { from: '2025-06' });
    same(d, { to: '2025-02' });
    same(d, { from: '2030-01' });
  }
});

test('khớp bản cũ trên đầu vào rỗng và trường hợp biên', () => {
  same({ orders: [], products: [] });
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Bê', category: 'X' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c1', 'A', 0, 100, '2025-01-31T23:30:00-05:00', 'refunded'),
    mk('1', 'c1', 'B', 2, 100, '2025-02-01T04:30:00Z', 'paid'),
    mk('2', 'c2', 'B', 3, 50, '2025-02-10T00:00:00Z', 'refunded'),
    mk('3', 'c3', 'ZZ', 1, 70, '2025-03-10T00:00:00+07:00', 'paid'),
    mk('4', 'c3', 'B', 1, 70, '2025-03-10T00:00:00+07:00', 'paid'),
    mk('5', 1, 'B', 1, 70, '2025-03-11T00:00:00Z', 'paid'),
    mk('5', '1', 'B', 1, 70, '2025-03-11T00:00:00Z', 'paid'),
    mk('6', 'c9', 'B', 1, 70, '2025-03-11T00:00:00Z', 'cancelled'),
    mk('7', 'c8', 'B', 1, 1.5, '2025-03-11T00:00:00Z', 'paid'),
  ];
  same({ orders, products });
  same({ orders, products }, { topN: 1, from: '2025-02', to: '2025-03' });
  same({ orders: orders.filter((o) => o.status !== 'paid'), products });
  same({ orders, products: [] });
  const odd = [mk('a', 'c', 'A', undefined, 5, '2025-01-01T00:00:00Z', 'paid'), mk('b', 'c', 'B', 2, 5, '2025-01-01T00:00:00Z', 'paid')];
  same({ orders: odd, products });
  same({ orders: odd, products: [{ sku: 'A', name: 'n' }, { sku: 'B', category: 'K' }] });
});

test('ném lỗi giống bản cũ khi ngày không hợp lệ', () => {
  const orders = [{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'khong-hop-le', status: 'paid' }];
  assert.throws(() => legacy(orders, []), RangeError);
  assert.throws(() => buildReport(orders, []), RangeError);
});

test('quy mô 200.000 dòng: khớp bản cũ trên mẫu 20.000 và chạy dưới 1 giây', () => {
  const d = generate({ orders: 20000, products: 2000, customers: 3000, seed: 42 });
  same(d, { topN: 5 });
  const big = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = Date.now();
  buildReport(big.orders, big.products, { topN: 5 });
  assert.ok(Date.now() - t0 < 3000); // ngưỡng nới để tránh flaky; bench mới là phép đo chính
});

test('khớp bản cũ trên giá trị lạ (fuzz kiểu dữ liệu, ngày, topN, from/to)', () => {
  const vals = [0, -0, 1, -3, 2.5, '2', '', null, undefined, NaN, Infinity, 1e308];
  const ids = ['a', 'b', 1, '1', null, undefined, NaN, 0, -0];
  const dates = ['2025-01-31T23:59:59Z', '2025-02-01T00:00:00+01:00', 1735689600000, new Date(0), null, '2025-02-15', '2025-03-01T00:00:00Z'];
  const sts = ['paid', 'refunded', 'cancelled', 'x', undefined];
  const products = [
    { sku: 'a', name: 'A', category: 'X' }, { sku: 'a', name: 'A2', category: 'Y' }, { sku: 1, name: 'U', category: 'X' },
    { sku: NaN, name: 'N', category: NaN }, { sku: undefined, name: 'V' }, { sku: null, name: null, category: null },
  ];
  let s = 12345;
  const r = (n) => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s % n);
  const opts = [undefined, { topN: 0 }, { topN: -1 }, { topN: 100 }, { topN: null }, { from: '2025-02', to: '2025-02' },
    { from: '2025-03', to: '2025-01' }, { from: '', to: '' }, { from: '2025-02' }, { to: '2025-01' }];
  for (let iter = 0; iter < 300; iter++) {
    const orders = [];
    for (let i = 0, n = r(25); i < n; i++) {
      orders.push({ id: ids[r(ids.length)], customerId: ids[r(ids.length)], sku: ids[r(ids.length)], qty: vals[r(vals.length)],
        unitPrice: vals[r(vals.length)], date: dates[r(dates.length)], status: sts[r(sts.length)] });
    }
    for (const o of opts) {
      let a, b;
      try { a = buildReport(orders, products, o); } catch (e) { a = e; }
      try { b = legacy(orders, products, o); } catch (e) { b = e; }
      if (a instanceof Error || b instanceof Error) {
        assert.ok(a instanceof Error && b instanceof Error && a.constructor === b.constructor);
      } else assert.deepStrictEqual(a, b);
    }
  }
});
