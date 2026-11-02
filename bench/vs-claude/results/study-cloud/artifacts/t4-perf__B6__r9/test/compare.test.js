'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport: next } = require('../src/report');
const { buildReport: legacy } = require('./fixtures/report.legacy');
const { generate, rng } = require('../src/gen');

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cốc', category: 'Gia dụng' },
];
let n = 0;
const o = (x = {}) => ({ id: `o${++n}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid', ...x });
const clone = (v) => structuredClone(v);

// So sánh kết quả hoặc lỗi ném ra giữa hai bản; kiểm tra input không bị đổi.
function same(orders, products, options) {
  const snap = JSON.stringify([orders, products, options]);
  const run = (f) => {
    try { return { ok: f(clone(orders), clone(products), options === undefined ? undefined : clone(options)) }; }
    catch (e) { return { err: e.constructor.name, msg: e.message }; }
  };
  const a = run(legacy);
  const b = run(next);
  assert.deepStrictEqual(b, a);
  if (a.ok) assert.equal(JSON.stringify(b.ok), JSON.stringify(a.ok));
  const oo = clone(orders), pp = clone(products), op = options === undefined ? undefined : clone(options);
  try { op === undefined ? next(oo, pp) : next(oo, pp, op); } catch { /* lỗi đã so ở trên */ }
  assert.equal(JSON.stringify([oo, pp, op]), snap);
  return a;
}

test('dữ liệu ngẫu nhiên có seed, nhiều tập và tùy chọn', () => {
  const opts = [undefined, {}, { topN: 1 }, { topN: 5, from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-04' }];
  for (const [i, size] of [500, 1200, 3000, 777, 2500].entries()) {
    const d = generate({ orders: size, products: 20 + i * 40, customers: 50 + i * 100, seed: 11 + i * 7 });
    for (const op of opts) same(d.orders, d.products, op);
  }
});

test('dữ liệu tự sinh có hòa và giá trị lệch', () => {
  const r = rng(99);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const orders = [];
  for (let i = 0; i < 2000; i++) {
    orders.push({
      id: `o${Math.floor(r() * 300)}`,
      customerId: pick(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']),
      sku: pick(['A', 'B', 'C', 'Z', 'Y']),
      qty: pick([0, 1, 2, 3]),
      unitPrice: pick([0, 100, 100, 250, 1000]),
      date: pick(['2025-01-31T23:30:00-05:00', '2025-02-01T00:30:00+07:00', '2025-03-15T00:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z']),
      status: pick(['paid', 'paid', 'refunded', 'cancelled']),
    });
  }
  for (const op of [undefined, { topN: 2 }, { topN: 0 }, { topN: 100 }, { from: '2025-02', to: '2025-12' }]) same(orders, P, op);
});

test('orders rỗng', () => {
  same([], P);
  same([], []);
  same([], P, { topN: 0, from: '2025-01', to: '2025-02' });
});

test('tất cả cancelled', () => {
  same([o({ status: 'cancelled' }), o({ status: 'cancelled', sku: 'B' })], P);
});

test('sku không có trong products / products rỗng', () => {
  same([o({ sku: 'NOPE' }), o({ sku: 'A' }), o({ sku: 'NOPE2', qty: 3 })], P);
  same([o(), o({ sku: 'B' })], []);
});

test('products trùng sku', () => {
  const prods = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }, { sku: 'B', name: 'Bút 2', category: 'Văn phòng phẩm' }];
  same([o(), o({ sku: 'B' }), o({ sku: 'A', qty: 2 })], prods);
});

test('hòa doanh thu / qty / sku / customerId', () => {
  const orders = [
    o({ customerId: 'c2', sku: 'B' }), o({ customerId: 'c1', sku: 'A' }), o({ customerId: 'c3', sku: 'C' }),
    o({ customerId: 'c10', sku: 'A', qty: 2, unitPrice: 500 }), o({ customerId: 'c9', sku: 'B', qty: 2, unitPrice: 500 }),
    o({ customerId: 'c4', sku: 'D' }), o({ customerId: 'c5', sku: 'E', qty: 2, unitPrice: 500 }),
  ];
  const prods = [...P, { sku: 'D', name: 'D', category: 'Đồ uống' }, { sku: 'E', name: 'E', category: 'Đồ uống' }];
  for (const topN of [1, 2, 3, 10]) same(orders, prods, { topN });
  same(orders.map((x) => ({ ...x, sku: 'A' })), P, { topN: 5 });
  same([o({ sku: 'A' }), o({ sku: 'B' }), o({ sku: 'C' })], P);
});

test('refunded làm doanh thu ≤ 0', () => {
  same([o({ status: 'refunded' }), o({ sku: 'B', status: 'refunded', qty: 3 })], P);
  same([o({ qty: 1 }), o({ status: 'refunded', qty: 1, id: 'r' })], P);
  same([o({ status: 'refunded', sku: 'B' }), o({ sku: 'B', qty: 2 }), o({ sku: 'A', status: 'refunded', customerId: 'c2' })], P);
});

test('topN: 0, 1, 100, âm, lẻ và giá trị lạ', () => {
  const d = generate({ orders: 800, products: 30, seed: 5 });
  for (const topN of [0, 1, 100, -1, -3, 1.5, 2.7, 0.5, -0.5, null, undefined, NaN, Infinity, '2']) same(d.orders, d.products, { topN });
});

test('from/to một đầu, from > to, bằng nhau', () => {
  const d = generate({ orders: 1500, seed: 8 });
  for (const op of [
    { from: '2025-05' }, { to: '2025-05' }, { from: '2025-09', to: '2025-03' }, { from: '2025-05', to: '2025-05' },
    { from: '2030-01' }, { to: '2000-01' }, { from: '', to: '' }, { from: '2025-1', to: '2025-6' },
  ]) same(d.orders, d.products, op);
});

test('date lệch múi giờ qua ranh giới tháng', () => {
  const orders = [
    o({ date: '2025-01-31T23:30:00-05:00' }), o({ date: '2025-02-01T00:30:00+07:00' }),
    o({ date: '2025-02-28T20:00:00-08:00' }), o({ date: '2025-12-31T23:00:00-02:00' }),
    o({ date: '2025-03-01T00:00:00+14:00' }), o({ date: '2024-02-29T12:00:00Z' }),
  ];
  same(orders, P);
  same(orders, P, { from: '2025-02', to: '2025-02' });
  same(orders, P, { to: '2025-01' });
});

test('một đơn nhiều dòng; cùng id ở nhiều tháng', () => {
  same([o({ id: 'x' }), o({ id: 'x', sku: 'B' }), o({ id: 'x', sku: 'C', status: 'refunded' })], P);
  same([
    o({ id: 'x', date: '2025-01-10T00:00:00Z' }), o({ id: 'x', date: '2025-02-10T00:00:00Z' }),
    o({ id: 'x', date: '2025-02-11T00:00:00Z', customerId: 'c2' }), o({ id: 'x', date: '2025-03-10T00:00:00Z', status: 'refunded' }),
  ], P);
});

test('qty hoặc unitPrice bằng 0; grandTotal = 0', () => {
  same([o({ qty: 0 }), o({ unitPrice: 0 }), o({ qty: 0, unitPrice: 0, status: 'refunded' })], P);
  same([o({ qty: 2 }), o({ qty: 2, status: 'refunded', id: 'r' })], P);
  same([o({ unitPrice: 0 })], P);
});

test('giá trị lớn và số thực', () => {
  same([o({ qty: 1e9, unitPrice: 1e9 }), o({ qty: 3, unitPrice: 0.1 }), o({ qty: 3, unitPrice: 0.2, sku: 'B' }), o({ qty: 1.5, unitPrice: 33.33, status: 'refunded' })], P);
  same([o({ qty: Number.MAX_SAFE_INTEGER, unitPrice: 3 }), o({ qty: 7, unitPrice: 1e308 }), o({ qty: 7, unitPrice: 1e308, sku: 'B' })], P);
  const r = rng(4);
  const many = Array.from({ length: 1500 }, () => o({
    qty: r() * 10, unitPrice: r() * 1e4, sku: ['A', 'B', 'C'][Math.floor(r() * 3)],
    customerId: `c${Math.floor(r() * 20)}`, status: r() < 0.3 ? 'refunded' : 'paid',
    date: `2025-0${1 + Math.floor(r() * 9)}-10T00:00:00Z`,
  }));
  same(many, P, { topN: 5 });
});

test('khóa đặc biệt', () => {
  const prods = [
    { sku: '__proto__', name: 'p', category: '__proto__' }, { sku: 'constructor', name: 'c', category: 'constructor' },
    { sku: 'toString', name: 't', category: 'toString' }, { sku: 'hasOwnProperty', name: 'h', category: 'hasOwnProperty' },
    { sku: '', name: 'e', category: '' }, { sku: '1', name: 'one', category: '10' }, { sku: 'x', name: 'x', category: 'unknown' },
  ];
  const orders = [];
  for (const [i, p] of prods.entries()) {
    orders.push(o({ sku: p.sku, customerId: p.sku, id: p.sku, qty: i + 1 }), o({ sku: p.sku, customerId: '__proto__', id: 'constructor' }));
  }
  orders.push(o({ sku: 'zzz', customerId: 'valueOf' }), o({ customerId: '2' }), o({ customerId: '10' }), o({ customerId: '1' }));
  same(orders, prods, { topN: 10 });
  same(orders, prods, { topN: 1 });
});

test('trường thiếu / kiểu lạ (JSON round-trip)', () => {
  same([o({ extra: undefined, customerId: undefined }), o({ customerId: null }), o({ sku: undefined }), o({ id: undefined }), o({ customerId: 5 }), o({ customerId: '5' })], P);
  same([o({ qty: undefined }), o({ unitPrice: 'abc' }), o({ qty: '2', unitPrice: '30' }), o({ status: 'weird' })], P);
  same([o({ extra: { a: 1 } }), o({ extra: [1, 2] })], P);
});

test('date không hợp lệ: ném lỗi giống nhau', () => {
  for (const date of ['không phải ngày', '', undefined, '2025-13-45T00:00:00Z', NaN]) {
    const r = same([o(), o({ date })], P);
    assert.ok(r.err, `phải ném lỗi với ${String(date)}`);
  }
  same([o({ date: null }), o()], P);
  same([o({ date: 0 }), o({ date: 1735689600000 })], P);
  same([o({ date: 'x', status: 'cancelled' })], P);
  same([o({ date: 'x' })], P, { from: '2030-01' });
});

test('options null / có trường undefined', () => {
  same([o()], P, null);
  same([o()], P, { topN: 3, from: undefined, to: undefined });
});

test('input đóng băng sâu vẫn chạy và cho kết quả giống nhau', () => {
  const d = generate({ orders: 600, seed: 21 });
  const deep = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(deep); Object.freeze(x); } return x; };
  deep(d.orders); deep(d.products);
  const opts = deep({ topN: 2, from: '2025-02' });
  const a = legacy(d.orders, d.products, opts);
  const b = next(d.orders, d.products, opts);
  assert.deepStrictEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});
