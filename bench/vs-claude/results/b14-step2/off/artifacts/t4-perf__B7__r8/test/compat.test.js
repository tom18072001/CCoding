'use strict';
// So sánh buildReport mới với bản cũ (test/report.legacy.js) — bản cũ là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy').buildReport;
const { generate, rng } = require('../src/gen');

function same(orders, products, options) {
  const a = JSON.stringify(orders);
  assert.deepStrictEqual(buildReport(orders, products, options), legacy(orders, products, options));
  assert.equal(JSON.stringify(orders), a, 'không sửa đầu vào');
}

test('khớp bản cũ trên dữ liệu sinh với nhiều seed/tùy chọn', () => {
  const opts = [undefined, {}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-06' }, { from: '2025-02', to: '2025-02' }, { from: '2025-09', to: '2025-01' }];
  for (let seed = 1; seed <= 6; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 25, seed });
    for (const o of opts) same(d.orders, d.products, o);
  }
});

test('khớp bản cũ với trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C', category: 'Z' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status, extra: 1 });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'),
    mk('1', 'c', 'B', 2, 0, '2025-01-01T00:00:00Z', 'refunded'),
    mk('2', 'd', 'ZZ', 3, 7, '2025-01-31T23:59:59-05:00', 'paid'),
    mk('2', 'd', 'C', 1, 5, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('3', 'e', 'C', -2, 5, '2025-02-03T00:00:00Z', 'paid'),
    mk('4', 'e', 'B', 1, 9, '2025-02-03T00:00:00Z', 'cancelled'),
    mk('5', 'f', 'B', 1, 10, '2025-03-03T00:00:00Z', 'weird'),
    mk('6', 'f', 'B', 1, 10, '2025-03-03T00:00:00Z', 'paid'),
    mk('7', 'g', 'C', 1, 5, '2025-03-03T00:00:00Z', 'paid'),
  ];
  for (const o of [undefined, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }, { from: '2026-01' }]) same(orders, products, o);
  same([], products);
  same(orders, []);
  same([mk('1', 'a', 'A', 1, 5, '2025-01-01T00:00:00Z', 'refunded')], products);
  same([mk('1', 'a', 'A', 1, 5, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'b', 'A', 1, 5, '2025-01-02T00:00:00Z', 'refunded')], products);
});

test('ngày sai ném lỗi như bản cũ', () => {
  const o = [{ id: '1', customerId: 'a', sku: 'A', qty: 1, unitPrice: 1, date: 'xx', status: 'cancelled' }];
  assert.throws(() => legacy(o, []), RangeError);
  assert.throws(() => buildReport(o, []), RangeError);
});

test('khớp bản cũ trên dữ liệu ngẫu nhiên nhiều đồng hạng', () => {
  const r = rng(99);
  const pick = (n) => Math.floor(r() * n);
  const products = [];
  for (let i = 0; i < 8; i++) products.push({ sku: 'S' + i, name: 'n' + i, category: 'K' + pick(3) });
  const st = ['paid', 'paid', 'refunded', 'cancelled'];
  const orders = [];
  for (let i = 0; i < 3000; i++) {
    orders.push({ id: 'o' + pick(300), customerId: 'c' + pick(12), sku: r() < 0.1 ? 'none' : 'S' + pick(8), qty: pick(3), unitPrice: pick(3) * 100, date: `2025-0${1 + pick(4)}-1${pick(9)}T0${pick(9)}:00:00${r() < 0.5 ? 'Z' : '+07:00'}`, status: st[pick(4)] });
  }
  same(orders, products, { topN: 4 });
});

const PRODUCTS = [
  { sku: 'A', name: 'Một', category: 'X' },
  { sku: 'A', name: 'Trùng', category: 'Y' },
  { sku: 'B', name: 'B', category: 'X' },
  { sku: 'C', name: 'C', category: 'Z' },
  { sku: 'D', name: 'D', category: 'Z' },
];
const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });

test('mảng rỗng và một dòng', () => {
  for (const o of [undefined, {}, { topN: 0 }, { from: '2025-01' }]) same([], PRODUCTS, o);
  same([], [], undefined);
  for (const st of ['paid', 'refunded', 'cancelled', 'weird']) {
    for (const o of [undefined, { topN: 0 }, { topN: 1 }, { from: '2025-01', to: '2025-01' }, { from: '2025-02' }]) {
      same([mk('1', 'c', 'A', 2, 50, '2025-01-15T10:00:00Z', st)], PRODUCTS, o);
    }
  }
});

test('tất cả dòng cancelled', () => {
  const orders = [];
  for (let i = 0; i < 50; i++) orders.push(mk('o' + (i % 7), 'c' + (i % 3), 'ABCD'[i % 4], i, 10, `2025-0${1 + (i % 5)}-10T00:00:00Z`, 'cancelled'));
  same(orders, PRODUCTS);
  same(orders, PRODUCTS, { topN: 0 });
  same(orders, PRODUCTS, { from: '2025-02', to: '2025-03' });
});

test('nhiều đồng hạng ở top (cùng doanh thu)', () => {
  const orders = [];
  for (let i = 0; i < 40; i++) orders.push(mk('o' + i, 'c' + (i % 10), 'ABCD'[i % 4], 1, 100, `2025-0${1 + (i % 3)}-05T00:00:00Z`, 'paid'));
  for (const topN of [0, 1, 2, 3, 5, 100]) same(orders, PRODUCTS, { topN });
  const prods = [];
  for (let i = 0; i < 12; i++) prods.push({ sku: 'T' + i, name: 'n' + i, category: 'K' + (i % 4) });
  const o2 = prods.map((p, i) => mk('x' + (i % 6), 'u' + (i % 5), p.sku, 1, 10, '2025-04-01T00:00:00Z', 'paid'));
  for (const topN of [1, 2, 3, 4, 7]) same(o2, prods, { topN });
});

test('from/to sát biên tháng', () => {
  const dates = [
    '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z',
    '2025-01-31T23:59:59-05:00', '2025-02-01T00:00:00+07:00', '2025-02-28T23:59:59.999Z', '2025-03-01T00:00:00Z',
    '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z', '2024-02-29T12:00:00Z',
  ];
  const orders = dates.map((d, i) => mk('o' + (i % 4), 'c' + (i % 3), 'ABCD'[i % 4], i + 1, 10, d, i % 5 === 0 ? 'refunded' : 'paid'));
  const months = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-12', '2026-01', '2023-01', '2027-01'];
  for (const from of [undefined, ...months]) {
    for (const to of [undefined, ...months]) same(orders, PRODUCTS, { from, to });
  }
});

test('sku trùng, sku lạ, qty/amount âm hoặc bằng 0 (-0), trạng thái lạ', () => {
  const orders = [
    mk('1', 'a', 'A', 0, 100, '2025-01-01T00:00:00Z', 'refunded'), // -0
    mk('1', 'a', 'B', 2, 0, '2025-01-01T00:00:00Z', 'refunded'), // -0
    mk('2', 'b', 'A', -3, 100, '2025-01-02T00:00:00Z', 'paid'),
    mk('2', 'b', 'B', 3, -100, '2025-01-02T00:00:00Z', 'paid'),
    mk('3', 'c', 'C', -2, -5, '2025-01-03T00:00:00Z', 'refunded'),
    mk('3', 'c', 'C', -1, 5, '2025-01-03T00:00:00Z', 'refunded'),
    mk('4', 'd', 'NOPE', 1, 7, '2025-02-03T00:00:00Z', 'paid'),
    mk('5', 'd', 'D', 1, 7, '2025-02-03T00:00:00Z', 'weird'),
    mk('5', 'e', 'D', 1, 7, '2025-02-03T00:00:00Z', 'PAID'),
    mk('6', 'e', 'D', 0, 0, '2025-02-03T00:00:00Z', 'paid'),
    mk('7', 'f', 'A', 1, 1, '2025-02-03T00:00:00Z', undefined),
    mk('8', 'f', 'A', 0, 5, '2025-03-03T00:00:00Z', 'paid'),
    mk('9', 'g', 'A', -0, 5, '2025-03-03T00:00:00Z', 'refunded'),
  ];
  for (const o of [undefined, { topN: 0 }, { topN: 1 }, { topN: 2 }, { from: '2025-02' }, { to: '2025-01' }]) same(orders, PRODUCTS, o);
  same(orders, [], { topN: 5 });
  same(orders, [{ sku: 'A', name: 'A1', category: 'Q' }, { sku: 'A', name: 'A2', category: 'R' }], undefined);
});

test('topN = 0 và topN rất lớn', () => {
  const d = generate({ orders: 3000, products: 30, customers: 20, seed: 7 });
  for (const topN of [0, 1, 1000, 1e9, Number.MAX_SAFE_INTEGER]) same(d.orders, d.products, { topN });
});

test('đầu vào lớn (~50.000 dòng) nhiều seed', () => {
  const opts = [{ topN: 5 }, { from: '2025-03', to: '2025-08', topN: 0 }];
  for (const seed of [1, 2, 3]) {
    const d = generate({ orders: 50000, products: 300, customers: 500, seed });
    for (const o of opts) same(d.orders, d.products, o);
  }
});

test('200.000 dòng dưới 1 giây (khởi động 1 lần, median của 5 lần đo)', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const run = () => {
    const t0 = process.hrtime.bigint();
    const rep = buildReport(d.orders, d.products, { topN: 5 });
    return [Number(process.hrtime.bigint() - t0) / 1e6, rep];
  };
  const [, warm] = run(); // khởi động, không tính
  assert.ok(warm.categories.length > 0);
  const times = [];
  for (let i = 0; i < 5; i++) times.push(run()[0]);
  times.sort((a, b) => a - b);
  const median = times[2];
  assert.ok(median < 1000, `median ${median} ms (các lần: ${times.map((t) => t.toFixed(0)).join(', ')})`);
});
