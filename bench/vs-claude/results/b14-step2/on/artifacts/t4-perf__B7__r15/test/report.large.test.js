'use strict';
// Đối chiếu quy mô lớn, đầu vào bất thường và tính bất biến của đầu vào so với bản gốc.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportReference } = require('./report.reference');
const { generate, rng } = require('../src/gen');

// Chạy hàm, trả { ok, value } hoặc { ok:false, ctor } để so sánh cả trường hợp ném lỗi.
function run(fn, args) {
  try {
    return { ok: true, value: fn(...args) };
  } catch (e) {
    return { ok: false, ctor: e && e.constructor };
  }
}

function same(args, label) {
  const a = run(buildReport, args);
  const b = run(buildReportReference, args);
  assert.equal(a.ok, b.ok, `${label}: một bên ném lỗi, bên kia thì không (mới ok=${a.ok}, cũ ok=${b.ok})`);
  if (b.ok) assert.deepStrictEqual(a.value, b.value, label);
  else assert.equal(a.ctor, b.ctor, `${label}: khác loại lỗi`);
  return b;
}

const products = [
  { sku: 'A', name: 'A1', category: 'X' },
  { sku: 'A', name: 'A2', category: 'Y' },
  { sku: 'B', name: 'B', category: 'X' },
  { sku: 'C', name: 'C', category: 'unknown' },
];
const base = { id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 100, date: '2025-01-15T10:00:00Z', status: 'paid' };
const withRow = (patch) => [{ ...base }, { ...base, id: 'o2', customerId: 'c2', sku: 'B', date: '2025-02-03T00:00:00Z' }, { ...base, ...patch, id: 'o3' }];

test('20.000 dòng ngẫu nhiên (seed cố định) giống hệt bản gốc trên nhiều options', () => {
  const optsList = [{}, { topN: 0 }, { topN: 1 }, { topN: 7 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 4 }, { from: '2031-01' }];
  for (const seed of [101, 202]) {
    const d = generate({ orders: 20000, products: 40, customers: 300, seed });
    for (const o of optsList) same([d.orders, d.products, o], `seed ${seed} ${JSON.stringify(o)}`);
  }
});

test('20.000 dòng tự dựng: đủ status, múi giờ, sku trùng / thiếu trong products', () => {
  const r = rng(7);
  const pick = (n) => Math.floor(r() * n);
  const skus = ['A', 'B', 'C', 'Z', 'Q', 'S1', 'S2'];
  const statuses = ['paid', 'refunded', 'cancelled', 'pending', 'paid'];
  const dates = ['2024-12-31T23:59:59Z', '2025-01-01T03:00:00+07:00', '2025-06-30T22:00:00-05:00', '2025-07-01T00:00:00Z', '2025-12-31T23:00:00-02:00', '2026-02-28T12:00:00+14:00'];
  const orders = [];
  for (let i = 0; i < 20000; i++) {
    orders.push({
      id: `o${pick(4000)}`,
      customerId: `c${pick(500)}`,
      sku: skus[pick(skus.length)],
      qty: pick(6) - (pick(8) === 0 ? 3 : 0),
      unitPrice: pick(5) * 250,
      date: dates[pick(dates.length)],
      status: statuses[pick(statuses.length)],
    });
  }
  const prods = [...products, { sku: 'S1', name: 'S1', category: 'Z' }, { sku: 'S2', name: 'S2', category: 'Z' }];
  for (const o of [{}, { topN: 2 }, { from: '2025-01', to: '2025-06' }, { to: '2025-01', topN: 10 }, { from: '2025-07' }]) {
    same([orders, prods, o], `tự dựng ${JSON.stringify(o)}`);
  }
});

test('đầu vào bất thường: ngày không hợp lệ', () => {
  for (const date of ['không phải ngày', '', null, undefined, '2025-13-45', NaN, {}]) same([withRow({ date }), products, {}], `date=${String(date)}`);
  // ngày không hợp lệ bị lọc/bỏ qua bởi from/to?
  same([withRow({ date: 'x' }), products, { from: '2025-01' }], 'date lỗi + from');
  same([withRow({ date: 'x' }), products, { to: '2025-12' }], 'date lỗi + to');
  // ngày dạng số (timestamp) và Date
  same([withRow({ date: 1736935200000 }), products, {}], 'date số');
  same([withRow({ date: new Date('2025-01-20T00:00:00Z') }), products, {}], 'date Date');
  same([withRow({ date: '2025-01-15' }), products, {}], 'date không múi giờ');
});

test('đầu vào bất thường: qty / unitPrice dạng chuỗi, null, undefined, NaN, vô cực', () => {
  const vals = ['3', '', 'abc', null, undefined, NaN, Infinity, -Infinity, 1.5, -0, true, []];
  for (const v of vals) {
    for (const status of ['paid', 'refunded', 'cancelled']) {
      same([withRow({ qty: v, status }), products, {}], `qty=${String(v)} ${status}`);
      same([withRow({ unitPrice: v, status }), products, {}], `unitPrice=${String(v)} ${status}`);
    }
  }
  same([withRow({ qty: '2', unitPrice: '50' }), products, {}], 'cả hai là chuỗi');
});

test('đầu vào bất thường: id / customerId / sku / status thiếu hoặc lạ', () => {
  const vals = [undefined, null, '', 0, NaN, 5, '5', false];
  for (const v of vals) {
    same([withRow({ customerId: v }), products, {}], `customerId=${String(v)}`);
    same([withRow({ id: v }), products, {}], `id=${String(v)}`);
    same([withRow({ sku: v }), products, {}], `sku=${String(v)}`);
    same([withRow({ status: v }), products, {}], `status=${String(v)}`);
  }
  const noCust = withRow({});
  delete noCust[2].customerId;
  same([noCust, products, {}], 'xóa customerId');
  // products thiếu trường / category lạ
  same([withRow({}), [{ sku: 'A' }, { sku: 'B', name: 'B', category: null }], {}], 'product thiếu name/category');
  same([withRow({}), [{ sku: 'A', name: 'N', category: undefined }], {}], 'category undefined');
});

test('đầu vào bất thường: options và tham số thiếu', () => {
  const rows = withRow({});
  same([rows, products], 'options bỏ trống');
  same([rows, products, undefined], 'options undefined');
  same([rows, products, null], 'options null');
  same([rows, products, { topN: undefined }], 'topN undefined');
  same([rows, products, { topN: null }], 'topN null');
  same([rows, products, { topN: 1000 }], 'topN lớn hơn số phần tử');
  same([rows, products, { topN: -1 }], 'topN âm');
  same([rows, products, { topN: 1.5 }], 'topN lẻ');
  same([rows, products, { topN: '2' }], 'topN chuỗi');
  same([rows, products, { from: '' , to: '' }], 'from/to rỗng');
  same([rows, products, { from: '2025-02', to: '2025-01' }], 'from > to');
  same([rows, products, { from: 202501 }], 'from số');
  same([rows, undefined, {}], 'products undefined');
  same([undefined, products, {}], 'orders undefined');
  same([null, products, {}], 'orders null');
  same([rows, null, {}], 'products null');
  same([[], [], {}], 'rỗng cả hai');
});

test('không mutate đầu vào', () => {
  const d = generate({ orders: 3000, products: 30, customers: 100, seed: 5 });
  const orders = d.orders;
  const prods = d.products;
  const opts = { topN: 4, from: '2025-02', to: '2025-10' };
  const snap = (x) => JSON.parse(JSON.stringify(x));
  const o0 = snap(orders), p0 = snap(prods), opt0 = snap(opts);
  buildReport(orders, prods, opts);
  assert.deepStrictEqual(orders, o0);
  assert.deepStrictEqual(prods, p0);
  assert.deepStrictEqual(opts, opt0);
  // kết quả không chia sẻ tham chiếu với đầu vào và gọi lặp lại cho cùng kết quả
  const r1 = buildReport(orders, prods, opts);
  const r2 = buildReport(orders, prods, opts);
  assert.deepStrictEqual(r1, r2);
  assert.deepStrictEqual(r1, buildReportReference(orders, prods, opts));
  // đóng băng đầu vào: bản mới không được ghi vào
  const frozen = snap(orders).map((o) => Object.freeze(o));
  assert.deepStrictEqual(buildReport(Object.freeze(frozen), Object.freeze(snap(prods).map((p) => Object.freeze(p))), Object.freeze({ ...opts })), r1);
});
