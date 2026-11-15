'use strict';
// So sánh bản mới (src/report.js) với bản cũ (test/legacy/report.legacy.js) trên cùng đầu vào.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport: next } = require('../src/report');
const { buildReport: legacy } = require('./legacy/report.legacy');
const { generate, rng } = require('../src/gen');

function same(orders, products, options, label = '') {
  const o0 = structuredClone(orders);
  const p0 = structuredClone(products);
  const opt0 = options === undefined ? undefined : structuredClone(options);
  const expected = options === undefined ? legacy(orders, products) : legacy(orders, products, options);
  const actual = options === undefined ? next(orders, products) : next(orders, products, options);
  assert.deepStrictEqual(actual, expected, label);
  // đầu vào không bị sửa
  assert.deepStrictEqual(orders, o0, 'orders bị sửa ' + label);
  assert.deepStrictEqual(products, p0, 'products bị sửa ' + label);
  if (opt0 !== undefined) assert.deepStrictEqual(options, opt0, 'options bị sửa ' + label);
  // gọi lần hai cho cùng kết quả (không có cache/trạng thái giữa các lần gọi)
  assert.deepStrictEqual(next(orders, products, options ?? {}), expected, 'lần gọi 2 ' + label);
  return actual;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'X' },
  { sku: 'B', name: 'Bút', category: 'Y' },
  { sku: 'C', name: 'Cà phê', category: 'X' },
];
let n = 0;
const row = (o = {}) => ({ id: 'o' + ++n, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-10T10:00:00Z', status: 'paid', ...o });

test('(1) generate nhiều seed và kích thước', () => {
  for (let seed = 1; seed <= 10; seed++) {
    for (const size of [0, 1, 50, 2000, 20000]) {
      const d = generate({ orders: size, seed });
      same(d.orders, d.products, { topN: 5 }, `seed=${seed} size=${size}`);
    }
  }
  const d = generate({ orders: 500, seed: 77, products: 5, customers: 4 });
  same(d.orders, d.products);
});

test('(2) tùy chọn topN', () => {
  const d = generate({ orders: 3000, seed: 5, products: 60 });
  for (const topN of [0, 1, 2, 3, 5, 100, -1, null, undefined]) same(d.orders, d.products, { topN }, `topN=${topN}`);
  same(d.orders, d.products, {});
  same(d.orders, d.products, undefined);
});

test('(2) tùy chọn from/to', () => {
  const d = generate({ orders: 3000, seed: 6 });
  const cases = [
    { from: '2025-03' }, { to: '2025-09' }, { from: '2025-03', to: '2025-09' }, { from: '2025-05', to: '2025-05' },
    { from: '2025-09', to: '2025-03' }, { from: '' }, { to: '' }, { from: '', to: '' },
    { from: '2030-01' }, { to: '2000-01' }, { from: '2000-01', to: '2030-01' }, { from: '2030-01', to: '2031-01' },
    { from: undefined, to: undefined }, { from: null, to: null }, { from: '2025-3', to: '2025-9' },
  ];
  for (const o of cases) same(d.orders, d.products, { ...o, topN: 2 }, JSON.stringify(o));
});

test('(3) múi giờ nhảy tháng UTC + from/to sát biên', () => {
  const orders = [
    row({ date: '2025-02-01T03:00:00+07:00' }), // UTC 2025-01-31T20:00
    row({ date: '2025-01-31T20:00:00-05:00' }), // UTC 2025-02-01T01:00
    row({ date: '2025-03-01T00:00:00+01:00' }), // UTC 2025-02-28
    row({ date: '2025-01-01T00:30:00+02:00' }), // UTC 2024-12-31
    row({ date: '2025-01-31T23:59:59.999Z' }), row({ date: '2025-02-01T00:00:00.000Z' }),
    row({ date: '2025-02-01T00:00:00+00:00' }), row({ date: '2025-02-01T00:00:00Z', status: 'refunded' }),
  ];
  const opts = [{}, { from: '2025-01' }, { from: '2025-02' }, { to: '2025-01' }, { to: '2024-12' }, { from: '2025-01', to: '2025-01' }, { from: '2025-02', to: '2025-02' }, { from: '2024-12', to: '2025-01' }];
  for (const o of opts) same(orders, P, o, JSON.stringify(o));
  // xác nhận thật sự có nhảy tháng
  const r = next(orders, P, {});
  assert.deepEqual(r.months, ['2024-12', '2025-01', '2025-02']);
});

test('(4) products: sku trùng, không tồn tại, thiếu trường, rỗng', () => {
  const orders = [row({ sku: 'A', qty: 2 }), row({ sku: 'Z' }), row({ sku: 'Z', qty: 3 }), row({ sku: 'D' }), row({ sku: 'E' }), row({ sku: 'A', status: 'refunded' }), row({ sku: undefined }), row({ sku: null })];
  same(orders, [{ sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'Y' }, { sku: 'D', category: 'X' }, { sku: 'E', name: 'E' }, { name: 'ko sku', category: 'Q' }], {});
  same(orders, [], {});
  same([], [], {});
  same(orders, [{ sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'X' }], { topN: 10 });
  same(orders, [{ sku: 'A', name: 'A2', category: 'X' }, { sku: 'A', name: 'A1', category: 'X' }, { sku: 'D', name: 'D', category: 'unknown' }]);
  same(orders, [{ sku: 'Z', name: 'Z', category: undefined }, { sku: 'D', name: null, category: null }]);
});

test('(5) toàn refunded / cancelled / grandTotal 0 / -0', () => {
  const mk = (st) => [row({ status: st }), row({ status: st, sku: 'B', customerId: 'c2' }), row({ status: st, date: '2025-04-01T00:00:00Z' })];
  same(mk('refunded'), P, {});
  same(mk('cancelled'), P, {});
  same(mk('paid'), P, {});
  same([], P, {});
  same([row({ qty: 2, unitPrice: 50 }), row({ qty: 2, unitPrice: 50, status: 'refunded' })], P, {});
  const z = [row({ qty: 0 }), row({ unitPrice: 0, status: 'refunded' }), row({ qty: 0, status: 'refunded', sku: 'B' }), row({ qty: 0, unitPrice: 0, status: 'refunded', sku: 'C', customerId: 'c9' })];
  const r = same(z, P, {});
  assert.ok(Object.is(r.grandTotal, 0));
  same(z, P, { topN: 0 });
  same([row({ qty: 0, status: 'refunded' })], P, {});
});

test('(5) hòa doanh thu: sản phẩm, danh mục, khách hàng', () => {
  const orders = [];
  for (const sku of ['C', 'A', 'B']) for (const cu of ['k3', 'k1', 'k2']) orders.push(row({ sku, customerId: cu, qty: 2, unitPrice: 100 }));
  orders.push(row({ sku: 'A', customerId: 'k1', qty: 1, unitPrice: 200 }), row({ sku: 'C', customerId: 'k2', qty: 4, unitPrice: 50 }));
  const prods = [...P, { sku: 'D', name: 'D', category: 'W' }, { sku: 'E', name: 'E', category: 'V' }];
  orders.push(row({ sku: 'D', qty: 1, unitPrice: 1200 }), row({ sku: 'E', qty: 1, unitPrice: 1200 }));
  same(orders, prods, { topN: 10 });
  same([...orders].reverse(), prods, { topN: 10 });
  same(orders, prods, { topN: 1 });
  const many = ['m7', 'm1', 'm5', 'm3', 'm6', 'm2', 'm4'].map((c) => row({ customerId: c }));
  same(many, P, {});
  same([...many].reverse(), P, {});
});

test('(5) đơn nhiều dòng, khách nhiều tháng, id ở hai tháng', () => {
  const orders = [
    row({ id: 'M', sku: 'A' }), row({ id: 'M', sku: 'B' }), row({ id: 'M', sku: 'C' }),
    row({ id: 'M', date: '2025-02-10T00:00:00Z' }),
    row({ id: 'M', status: 'refunded', date: '2025-02-11T00:00:00Z' }),
    row({ id: 'N', date: '2025-03-10T00:00:00Z' }), row({ id: 'N', status: 'refunded', date: '2025-03-10T00:00:00Z' }),
    row({ id: 'N', customerId: 'c2', date: '2025-04-10T00:00:00Z' }),
    row({ id: 'R', customerId: 'c3', status: 'refunded' }),
  ];
  same(orders, P, {});
  same(orders, P, { from: '2025-02', to: '2025-03' });
});

test('(a)-(k) hành vi lạ: đầu vào lệch / biên', () => {
  // (a) ngày không hợp lệ ném RangeError, kể cả dòng cancelled
  for (const st of ['paid', 'cancelled']) {
    assert.throws(() => legacy([row({ date: 'bậy', status: st })], P), RangeError);
    assert.throws(() => next([row({ date: 'bậy', status: st })], P), RangeError);
  }
  // date là số / Date
  same([row({ date: Date.UTC(2025, 5, 1) }), row({ date: new Date('2025-07-01T00:00:00Z') })], P, {});
  // (f) NaN / Infinity / undefined / null / chuỗi trong qty, unitPrice
  for (const v of [NaN, Infinity, -Infinity, undefined, null, '3', 2.5, -4]) {
    same([row({ qty: v }), row({ unitPrice: v, status: 'refunded' }), row({ qty: v, sku: 'B', customerId: 'c2' }), row({ sku: 'B' })], P, {}, 'qty/unitPrice=' + String(v));
  }
  same([row({ customerId: undefined }), row({ customerId: null }), row({ customerId: 5 }), row({ customerId: '5' }), row({ id: undefined }), row({ id: 1 }), row({ id: '1' })], P, {});
  same([row({ status: 'weird' }), row({ status: undefined }), row({ status: 'paid' })], P, {});
  same([row({ sku: 'p' }), row({ sku: 'q' })], [{ sku: 'p', name: 'p', category: '__proto__' }, { sku: 'q', name: 'q', category: 'constructor' }], {});
  same([row({ date: '0001-01-01T00:00:00Z' }), row({ date: '2025-06-01T00:00:00Z' }), row({ date: '9999-12-31T00:00:00Z' })], P, {});
});

test('(6) fuzz tất định với pool hẹp', () => {
  const r = rng(20240607);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const skus = ['S1', 'S2', 'S3', 'S4', 'S5', 'GONE'];
  const cats = ['K1', 'K2', 'K3'];
  const custs = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
  const ids = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'];
  const dates = ['2025-01-31T20:00:00-05:00', '2025-02-01T03:00:00+07:00', '2025-02-15T00:00:00Z', '2025-03-01T00:30:00+01:00', '2025-03-20T12:00:00Z', '2024-12-31T23:59:59Z'];
  const sts = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
  const months = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '', undefined];
  for (let t = 0; t < 200; t++) {
    const np = 1 + Math.floor(r() * 8);
    const prods = [];
    for (let i = 0; i < np; i++) prods.push({ sku: pick(skus.slice(0, 5)), name: 'N' + Math.floor(r() * 3), category: pick(cats) });
    const len = 10 + Math.floor(r() * 291);
    const orders = [];
    for (let i = 0; i < len; i++) {
      orders.push({ id: pick(ids), customerId: pick(custs), sku: pick(skus), qty: Math.floor(r() * 4), unitPrice: pick([0, 100, 100, 250, 500]), date: pick(dates), status: pick(sts) });
    }
    same(orders, prods, { topN: pick([0, 1, 2, 3, 5, undefined]), from: pick(months), to: pick(months) }, 'fuzz#' + t);
  }
});
