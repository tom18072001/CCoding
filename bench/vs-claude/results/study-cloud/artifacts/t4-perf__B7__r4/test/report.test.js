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
  const { buildReport: legacy } = require('./report.legacy');
  const optsList = [{}, { topN: 1 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-02' }, { topN: 0 }];
  for (const seed of [1, 2, 3, 7, 11]) {
    const d = generate({ orders: 3000, products: 40, customers: 50, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o));
  }
  // trường hợp biên: hoàn tiền giá 0, sản phẩm thiếu, danh mục thiếu, rỗng
  const products = [{ sku: 'A', name: 'x' }, { sku: 'A', name: 'dup', category: 'Z' }, { sku: 'B', name: 'b', category: 'Z' }];
  const orders = [
    { id: 1, customerId: 'c', sku: 'A', qty: 0, unitPrice: 10, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 1, customerId: 'c', sku: 'B', qty: 2, unitPrice: 10, date: '2024-12-31T20:00:00-05:00', status: 'paid' },
    { id: 2, customerId: 'd', sku: 'Q', qty: 1, unitPrice: 1.5, date: '2025-01-09T00:00:00Z', status: 'weird' },
  ];
  assert.deepStrictEqual(buildReport(orders, products), legacy(orders, products));
  assert.deepStrictEqual(buildReport([], products), legacy([], products));
});

test('fuzz đối chiếu bản cũ (đầu vào lạ)', () => {
  const { buildReport: legacy } = require('./report.legacy');
  let st = 12345;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const skus = ['A', 'B', 'C', 'D', 'E', 'Z', 1, 2, null, undefined, NaN, 0, -0, ''];
  const nums = [0, -0, 1, 2, 3, -4, 1.5, 0.1, 0.2, 1e6, '5', '2.5', '0', 'abc', null, undefined, NaN, Infinity, -Infinity];
  const cats = ['x', 'y', 'z', undefined, null, NaN, ''];
  const names = ['n1', 'n2', undefined, null, NaN];
  const stat = ['paid', 'paid', 'refunded', 'cancelled', 'weird', undefined, null];
  const custs = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 7, null, undefined, NaN, 0, -0];
  const ids = [1, 2, 3, 4, 5, 'a', 'b', null, undefined, NaN, 0, -0];
  const dates = ['2025-01-05T10:00:00Z', '2025-01-31T23:30:00-05:00', '2025-02-01T00:30:00+07:00', '2025-03-10T00:00:00Z', '2024-12-31T20:00:00-05:00', '2025-07-01T00:00:00.000Z', 1735689600000];
  const monthsOpt = [undefined, '', '2024-12', '2025-01', '2025-02', '2025-03', '2025-07', 'zzz'];
  const topNs = [undefined, null, 0, -1, -2, 1, 2, 3, 100, '2', 'abc', NaN, 1.5, Infinity];
  let cases = 0;
  for (let it = 0; it < 1500; it++) {
    const np = Math.floor(rnd() * 8);
    const products = [];
    for (let i = 0; i < np; i++) {
      const p = { sku: pick(skus), name: pick(names), category: pick(cats) };
      if (rnd() < 0.15) delete p.category;
      products.push(p);
    }
    const n = Math.floor(rnd() * 40);
    const orders = [];
    for (let i = 0; i < n; i++) {
      const o = { id: pick(ids), customerId: pick(custs), sku: pick(skus), qty: pick(nums), unitPrice: pick(nums), date: pick(dates), status: pick(stat) };
      if (rnd() < 0.05) delete o.qty;
      orders.push(o);
    }
    const options = rnd() < 0.15 ? undefined : { topN: pick(topNs), from: pick(monthsOpt), to: pick(monthsOpt) };
    if (options && rnd() < 0.3) delete options.topN;
    cases++;
    assert.deepStrictEqual(buildReport(orders, products, options), legacy(orders, products, options), 'case ' + it);
    // thứ tự khóa
    const a = buildReport(orders, products, options);
    assert.deepStrictEqual(Object.keys(a), ['months', 'grandTotal', 'categories', 'monthly', 'topCustomers']);
  }
  assert.equal(cases, 1500);
  assert.deepStrictEqual(buildReport([], [], undefined), legacy([], [], undefined));
});
