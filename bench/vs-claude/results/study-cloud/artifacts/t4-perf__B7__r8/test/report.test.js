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
  const legacy = require('./report.legacy').buildReport;
  const opts = [{}, { topN: 1 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-11' }, { to: '2025-02', topN: 0 }];
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 1500, products: 40, customers: 30, seed });
    for (const o of opts) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o));
  }
  // trường hợp biên: hoàn tiền giá 0 (-0), qty âm, trạng thái lạ, sku trùng, rỗng
  const products = [{ sku: 'A', name: 'a1', category: 'X' }, { sku: 'A', name: 'a2', category: 'Y' }];
  const orders = [
    { id: 1, customerId: 'c', sku: 'A', qty: 0, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 1, customerId: 'c', sku: 'A', qty: -2, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: 2, customerId: 'd', sku: 'Z', qty: 1, unitPrice: 5, date: '2025-01-31T23:00:00-05:00', status: 'pending' },
    { id: 3, customerId: 'd', sku: 'A', qty: -1, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'paid' },
  ];
  for (const set of [orders, []]) assert.deepStrictEqual(buildReport(set, products), legacy(set, products));
});

const legacy = require('./report.legacy').buildReport;
const same = (orders, products, o) => {
  let a, b, ea, eb;
  try { a = buildReport(orders, products, o); } catch (e) { ea = e; }
  try { b = legacy(orders, products, o); } catch (e) { eb = e; }
  if (ea || eb) {
    assert.ok(ea && eb, 'một bên ném lỗi, bên kia không');
    assert.equal(ea.constructor, eb.constructor);
    assert.equal(ea.message, eb.message);
  } else assert.deepStrictEqual(a, b);
};
const row = (x) => ({ id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 10, date: '2025-03-05T00:00:00Z', status: 'paid', ...x });
const prods = [{ sku: 'A', name: 'a1', category: 'X' }, { sku: 'A', name: 'a2', category: 'Y' }, { sku: 'B', name: 'b', category: 'X' }];

test('ca biên: kiểu dữ liệu qty/unitPrice, ngày, múi giờ, from/to, topN', () => {
  const vals = ['3', null, undefined, '', 'abc', 0, -0, -2, NaN, Infinity, 1.5, true];
  for (const v of vals) for (const st of ['paid', 'refunded', 'pending']) {
    for (const f of ['qty', 'unitPrice']) {
      const orders = [row({ [f]: v, status: st }), row({ sku: 'B', id: 2, status: st }), row({ sku: 'B', qty: 2, id: 3 })];
      same(orders, prods); same(orders, []); same(orders, prods, { topN: 0 });
    }
  }
  for (const d of ['xyz', undefined, null, 0, '2025-13-45', '2025-01-31T23:00:00-05:00', '2025-02-01T01:00:00+14:00', 1700000000000]) {
    same([row({ date: '2025-01-01T00:00:00Z' }), row({ date: d })], prods);
    same([row({ date: d, status: 'cancelled' })], prods);
  }
  const orders = [row({}), row({ date: '2025-04-01T00:00:00Z', sku: 'B' }), row({ date: '2025-05-31T23:59:59Z', sku: 'Q' })];
  for (const o of [{ from: '2025-04' }, { to: '2025-04' }, { from: '2025-04', to: '2025-04' }, { from: '2025-06' }, { from: '2025-05', to: '2025-03' },
    { from: '' , to: ''}, { topN: 0 }, { topN: 1 }, { topN: 100 }, { topN: null }, { topN: -1 }, { topN: 1.5 }, { topN: undefined }]) same(orders, prods, o);
  same([], prods, { topN: 0 });
});

test('ca biên: thứ tự khi bằng điểm sort, -0, sku trùng/thiếu', () => {
  const ps = ['b', 'a', 'c', 'd'].map((s) => ({ sku: s, name: 'n' + s, category: 'same' }));
  const orders = ['c', 'a', 'b', 'd', 'a'].map((s, i) => row({ sku: s, id: i, customerId: 'u' + (i % 3), qty: 1, unitPrice: 5 }));
  same(orders, ps); same(orders, ps, { topN: 2 });
  same([row({ qty: 0, status: 'refunded' }), row({ unitPrice: 0, status: 'refunded', sku: 'B' })], prods);
  same([row({ sku: 'Z' }), row({ sku: 'Y', category: 'X' })], prods);
});

test('fuzz có seed cố định', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const qtys = [1, 2, 3, 0, -1, 5, '2', null, 1.5];
  const prices = [0, 100, 250, 999, '10', null, -5];
  const dates = ['2025-01-01T00:00:00Z', '2025-01-31T23:00:00-05:00', '2025-02-15T12:00:00+09:00', '2025-03-01T00:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00+07:00'];
  const sts = ['paid', 'paid', 'refunded', 'cancelled', 'pending'];
  const skus = ['A', 'B', 'C', 'D', 'E', 'Z'];
  for (let it = 0; it < 300; it++) {
    const ps = [];
    for (const k of skus.slice(0, 5)) if (rnd() < 0.9) ps.push({ sku: k, name: 'n' + k + it % 2, category: pick(['X', 'Y', 'Z']) });
    const orders = [];
    const n = Math.floor(rnd() * 40);
    for (let i = 0; i < n; i++) orders.push({ id: 'o' + Math.floor(rnd() * 15), customerId: 'c' + Math.floor(rnd() * 8), sku: pick(skus), qty: pick(qtys), unitPrice: pick(prices), date: pick(dates), status: pick(sts) });
    same(orders, ps, pick([{}, { topN: 0 }, { topN: 1 }, { topN: 50 }, { from: '2025-02' }, { to: '2025-02', topN: 2 }, { from: '2025-02', to: '2025-12' }]));
  }
});
