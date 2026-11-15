'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy');
const { generate, rng } = require('../src/gen');

function same(orders, products, options, label = '') {
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.deepStrictEqual(b, a, label);
  assert.equal(JSON.stringify(b), JSON.stringify(a), label); // cả thứ tự khóa
}

function sameError(orders, products, options) {
  let ea, eb;
  try { legacy.buildReport(orders, products, options); } catch (e) { ea = e; }
  try { buildReport(orders, products, options); } catch (e) { eb = e; }
  assert.ok(ea, 'bản cũ phải ném lỗi');
  assert.ok(eb, 'bản mới phải ném lỗi');
  assert.equal(eb.constructor, ea.constructor);
  assert.equal(eb.name, ea.name);
  assert.equal(eb.message, ea.message);
}

const STATUS = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
const DATES = [
  '2024-12-31T23:59:59.999Z', '2025-01-01T00:00:00Z', '2024-12-31T23:30:00-05:00',
  '2025-01-31T20:00:00-07:00', '2025-02-01T06:59:59+07:00', '2025-02-28T23:59:59Z',
  '2025-03-01T00:00:00+14:00', '2025-06-30T23:59:59-12:00', '2025-07-01T00:00:00Z',
  '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
];
const QTYS = [0, 1, 2, 3, 1.5, 0.1, 0.2, -1, -2, '3', '2', null, 7];
const PRICES = [0, 100, 250, 99.99, 0.1, 0.2, 33.33, -50, '120', null, 1999];

function messy(seed, n) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = [
    { sku: 'A', name: 'Đầu', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C', category: 'Z' },
    { sku: 'D', name: 'D', category: 'Z' },
    { sku: 'E', name: 'E' },
  ];
  const orders = [];
  for (let i = 0; i < n; i++) {
    orders.push({
      id: 'o' + Math.floor(r() * (n / 3 + 1)),
      customerId: 'c' + Math.floor(r() * 15),
      sku: pick(['A', 'B', 'C', 'D', 'E', 'Z']),
      qty: pick(QTYS),
      unitPrice: pick(PRICES),
      date: pick(DATES),
      status: pick(STATUS),
    });
  }
  return { orders, products };
}

test('đối chiếu: dữ liệu lệch chuẩn (số lẻ, âm, chuỗi số, null), nhiều seed', () => {
  const opts = [undefined, { topN: 1 }, { from: '2025-01', to: '2025-06' }, { topN: 5, from: '2025-02' }];
  for (let seed = 100; seed < 140; seed++) {
    const { orders, products } = messy(seed, 400);
    for (const o of opts) same(orders, products, o, `seed ${seed} ${JSON.stringify(o)}`);
  }
});

test('đối chiếu: dữ liệu sinh ngẫu nhiên, nhiều seed hơn', () => {
  for (let seed = 200; seed < 230; seed++) {
    const d = generate({ orders: 800, products: 4 + (seed % 30), customers: 10 + (seed % 50), seed });
    for (const o of [undefined, { topN: 2 }, { from: '2025-04', to: '2025-10' }]) same(d.orders, d.products, o, `seed ${seed}`);
  }
});

test('đối chiếu: topN 0, 1, lớn hơn số lượng; from/to ở ranh giới', () => {
  const { orders, products } = messy(7, 600);
  const tops = [0, 1, 2, 3, 100, 1e9];
  const edges = [undefined, '2024-12', '2025-01', '2025-02', '2025-12', '2026-01', '2026-02', '0000-00', '9999-99', ''];
  for (const topN of tops) same(orders, products, { topN });
  for (const from of edges) {
    for (const to of edges) same(orders, products, { from, to, topN: 2 }, `from=${from} to=${to}`);
  }
  same(orders, products, { from: '2025-06', to: '2025-06' });
  same(orders, products, { from: '2025-07', to: '2025-06' }); // from > to -> rỗng
  same(orders, products, { topN: null });
  same(orders, products, {});
});

test('đối chiếu: date không hợp lệ -> cùng loại lỗi', () => {
  const products = [{ sku: 'A', name: 'a', category: 'c' }];
  const good = { id: 1, customerId: 'x', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' };
  for (const bad of ['không phải ngày', '', undefined, 'invalid', '2025-13-45']) {
    sameError([good, { ...good, id: 2, date: bad }], products);
    sameError([{ ...good, date: bad }], products, { from: '2030-01' }); // lỗi vẫn ném trước bước lọc
    sameError([{ ...good, date: bad, status: 'cancelled' }], products);
  }
});

test('đối chiếu: đầu vào lớn ~20.000 dòng (bắt lệch float)', () => {
  const d = generate({ orders: 20000, products: 60, customers: 500, seed: 4242 });
  same(d.orders, d.products);
  same(d.orders, d.products, { topN: 10, from: '2025-03', to: '2025-11' });
  const m = messy(31337, 20000);
  same(m.orders, m.products);
  same(m.orders, m.products, { topN: 0 });
  // giá/số lượng lẻ thuần túy để lộ sai khác thứ tự cộng dồn
  const r = rng(5);
  const orders = [];
  for (let i = 0; i < 20000; i++) {
    orders.push({
      id: 'o' + (i >> 1), customerId: 'c' + Math.floor(r() * 40), sku: 'S' + Math.floor(r() * 25),
      qty: Math.floor(r() * 90) / 7 + 0.1, unitPrice: Math.floor(r() * 100000) / 3,
      date: DATES[Math.floor(r() * DATES.length)], status: STATUS[Math.floor(r() * STATUS.length)],
    });
  }
  const products = Array.from({ length: 25 }, (_, i) => ({ sku: 'S' + i, name: 'n' + i, category: 'k' + (i % 5) }));
  same(orders, products);
  same(orders, products, { topN: 7, from: '2025-01', to: '2025-07' });
});
