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
  const optsList = [{}, { topN: 1 }, { topN: 5 }, { from: '2025-03', to: '2025-09' }, { topN: 2, from: '2025-06' }, { to: '2025-02' }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: seed % 3 ? 40 : 5, customers: seed % 2 ? 30 : 400, seed });
    if (seed % 4 === 0) d.products.push({ ...d.products[0], name: 'trùng sku', category: 'Khác' });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o));
  }
  assert.deepStrictEqual(buildReport([], [], {}), legacy([], [], {}));
});

// ---- Ca biên đối chiếu với bản cũ ----
const legacy = require('./report.legacy').buildReport;
const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
  { sku: 'D', name: 'Vở', category: 'Văn phòng phẩm' },
];
let seq = 0;
const row = (o) => ({ id: `o${++seq}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid', ...o });
const same = (orders, products = P, opts) => {
  const snap = JSON.stringify([orders, products]);
  assert.deepStrictEqual(buildReport(orders, products, opts), legacy(orders, products, opts));
  assert.equal(JSON.stringify([orders, products]), snap, 'không được sửa đầu vào');
};

test('hoàn tiền có qty*unitPrice = 0 (-0)', () => {
  same([row({ status: 'refunded', qty: 0 }), row({ status: 'refunded', unitPrice: 0, sku: 'B' }), row({ qty: 2 })]);
  same([row({ status: 'refunded', qty: 0 })]);
});

test('trạng thái lạ', () => {
  const o = [row({ status: 'pending', id: 'x', customerId: 'c9' }), row({ status: 'PAID' }), row({ status: undefined }), row({ status: 'paid', qty: 3 })];
  same(o);
  same(o, P, { topN: 1 });
});

test('SKU không có trong products và SKU trùng', () => {
  const o = [row({ sku: 'ZZ' }), row({ sku: 'ZZ', qty: 3 }), row({ sku: 'A' }), row({ sku: 'YY', qty: 3 })];
  same(o);
  same(o, [...P, { sku: 'A', name: 'Trùng', category: 'Khác' }, { sku: 'ZZ', name: 'Z', category: 'Đồ uống' }]);
  same([row({ sku: 'A' })], [{ sku: NaN, name: 'n', category: 'k' }, ...P]); // product có sku NaN không bao giờ khớp
});

test('khách / đơn xuất hiện ở cả paid lẫn refunded', () => {
  same([
    row({ id: 'o1', status: 'paid', qty: 3 }),
    row({ id: 'o1', status: 'refunded', qty: 1 }),
    row({ id: 'o1', status: 'paid', sku: 'B' }),
    row({ id: 'o2', customerId: 'c2', status: 'refunded', qty: 5 }),
    row({ id: 'o3', customerId: 'c2', status: 'paid', date: '2025-02-10T00:00:00Z' }),
  ]);
});

test('bằng doanh thu: thứ tự khi hòa', () => {
  const o = [];
  for (const sku of ['D', 'C', 'B', 'A']) o.push(row({ sku, customerId: 'k' + sku }));
  for (const sku of ['A', 'B', 'C', 'D']) o.push(row({ sku, customerId: 'm' + sku, qty: 2, unitPrice: 500 }));
  same(o);
  same(o, P, { topN: 1 });
  same([row({ sku: 'A', qty: 1, unitPrice: 2000 }), row({ sku: 'C', qty: 2, unitPrice: 1000 })]); // cùng revenue, khác qty
  same(o.map((x) => ({ ...x, customerId: 'same' })));
});

test('topN: 0, rất lớn, không đặt, undefined', () => {
  const d = generate({ orders: 800, products: 12, seed: 7 });
  for (const opts of [{ topN: 0 }, { topN: 1000 }, {}, { topN: undefined }, { topN: null }, undefined]) same(d.orders, d.products, opts);
});

test('lọc from/to', () => {
  const d = generate({ orders: 800, seed: 8 });
  for (const opts of [{ from: '2025-08', to: '2025-03' }, { from: '2025-05' }, { to: '2025-05' }, { from: '2025-05', to: '2025-05' }, { from: '', to: '' }, { from: '2030-01' }, { to: '2000-01' }]) same(d.orders, d.products, opts);
});

test('múi giờ, ranh giới tháng UTC, cancelled ngoài khoảng', () => {
  const o = [
    row({ date: '2025-01-31T23:59:59Z' }),
    row({ date: '2025-02-01T00:00:00Z' }),
    row({ date: '2025-02-01T03:00:00+07:00' }), // = 2025-01-31 UTC
    row({ date: '2025-01-31T20:00:00-05:00' }), // = 2025-02-01 UTC
    row({ date: '2025-12-31T23:30:00-02:00' }), // sang 2026-01 UTC
    row({ date: '2025-03-01T00:00:00.000Z', status: 'refunded' }),
    row({ date: '2025-03-15T00:00:00Z', status: 'cancelled' }),
    row({ date: '2025-01-05T10:00:00Z', status: 'cancelled' }),
    row({ date: Date.UTC(2025, 5, 1) }),
    row({ date: new Date('2025-07-01T00:00:00Z') }),
  ];
  same(o);
  same(o, P, { from: '2025-02', to: '2025-02' });
  same(o, P, { from: '2025-02' });
  same(o, P, { to: '2025-01' });
});

test('ngày sai ở dòng cancelled: cả hai bản ném RangeError', () => {
  const o = [row(), row({ status: 'cancelled', date: 'không phải ngày' })];
  assert.throws(() => legacy(o, P, {}), RangeError);
  assert.throws(() => buildReport(o, P, {}), RangeError);
  // vẫn ném kể cả khi dòng nằm ngoài khoảng lọc
  assert.throws(() => legacy(o, P, { from: '2030-01' }), RangeError);
  assert.throws(() => buildReport(o, P, { from: '2030-01' }), RangeError);
  // lặp lại lần 2 vẫn ném (không có cache giữa các lần gọi)
  assert.throws(() => buildReport(o, P, {}), RangeError);
});

test('đầu vào rỗng', () => {
  same([], []);
  same([], P, { topN: 0, from: '2025-01' });
  same([row()], []);
  same([row({ status: 'cancelled' })], P);
});

test('không có trạng thái giữa các lần gọi', () => {
  const d = generate({ orders: 500, seed: 21 });
  const a = buildReport(d.orders, d.products);
  const b = buildReport(d.orders, d.products);
  assert.deepStrictEqual(a, b);
  assert.notStrictEqual(a.months, b.months);
});

test('dữ liệu sinh bằng gen.js, nhiều seed', () => {
  for (let seed = 100; seed < 120; seed++) {
    const d = generate({ orders: 600, products: 3 + (seed % 25), customers: 5 + (seed % 60), seed });
    same(d.orders, d.products);
    same(d.orders, d.products, { topN: seed % 6, from: '2025-04', to: '2025-10' });
  }
});
