'use strict';
// Differential fuzz: so sánh buildReport hiện tại với bản cũ (test/report.legacy.js) trên dữ liệu ngẫu nhiên có seed cố định.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKUS = ['A', 'B', 'C', 'D', 'E', 'F', 'Q', 'x1', 'x2'];
const CATS = ['Đồ uống', 'Bánh', 'Văn phòng phẩm', 'Z', undefined];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled', 'weird', undefined];
const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:30:00-05:00', '2025-02-01T03:00:00+07:00',
  '2025-03-15', '2025-06-30T12:00:00.123Z', '2025-07-01T00:00:00.000+00:00', '2025-11-20T08:00:00Z',
  '2026-02-28T10:00:00Z', '2023-05-05T05:05:05Z', 'Mar 3, 2025 10:00:00 UTC', '2025/04/10',
  1735689600000, 1700000000000, new Date('2025-08-08T08:08:08Z'), null, 0,
];
const BAD_DATES = ['khong-hop-le', '', 'abc', undefined, NaN, {}];
const NUMS = [0, 1, 2, 3, 5, 10, 100, 1000, 2500, -1, -7, -100, 0.5, 1.25, 0.1, 0.2, 0.3, 33.333, '2', '10', '0', '1.5', 'abc', '', null, undefined, NaN, Infinity, -Infinity, -0, 1e15, 1e-7, true];

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

function genCase(seed) {
  const r = prng(seed);
  const nProducts = Math.floor(r() * 8);
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    const p = { sku: pick(r, SKUS), name: 'N' + i };
    const c = pick(r, CATS);
    if (r() < 0.9) p.category = c; // đôi khi thiếu hẳn thuộc tính
    products.push(p);
  }
  const n = r() < 0.05 ? 0 : Math.floor(r() * 40);
  const wild = r() < 0.5; // một nửa bộ dùng số lạ
  const allowBad = r() < 0.12;
  const orders = [];
  for (let i = 0; i < n; i++) {
    const o = {
      id: r() < 0.9 ? 'o' + Math.floor(r() * 12) : pick(r, [1, 2, null, undefined]),
      customerId: r() < 0.9 ? 'c' + Math.floor(r() * 8) : pick(r, [1, 'c1', null, undefined]),
      sku: pick(r, SKUS),
      qty: wild ? pick(r, NUMS) : 1 + Math.floor(r() * 5),
      unitPrice: wild ? pick(r, NUMS) : Math.floor(r() * 5000),
      date: allowBad && r() < 0.1 ? pick(r, BAD_DATES) : pick(r, DATES),
      status: pick(r, STATUSES),
    };
    if (r() < 0.03) delete o.qty;
    orders.push(o);
  }
  const months = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-06', '2025-11', '2026-02', '2030-01', 'x'];
  const options = {};
  const t = r();
  options.topN = t < 0.15 ? 0 : t < 0.35 ? 1 : t < 0.5 ? 100 : t < 0.6 ? undefined : 1 + Math.floor(r() * 4);
  if (options.topN === undefined) delete options.topN;
  if (r() < 0.3) options.from = pick(r, months);
  if (r() < 0.3) options.to = pick(r, months);
  return { orders, products, options };
}

function run(fn, c) {
  try {
    return { ok: fn(c.orders, c.products, c.options) };
  } catch (e) {
    return { err: { name: e.name, message: e.message, ctor: e.constructor } };
  }
}

test('fuzz: 400 bộ dữ liệu giống hệt bản cũ (kết quả hoặc lỗi)', () => {
  let errCases = 0;
  let okCases = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const c = genCase(seed);
    const a = run(buildReport, c);
    const b = run(legacy, c);
    const ctx = `seed=${seed}`;
    if (b.err) {
      errCases++;
      assert.ok(a.err, `${ctx}: bản cũ ném lỗi nhưng bản mới không`);
      assert.deepStrictEqual(a.err, b.err, ctx);
    } else {
      okCases++;
      assert.ok(!a.err, `${ctx}: bản mới ném lỗi ${a.err && a.err.message}`);
      assert.deepStrictEqual(a.ok, b.ok, ctx);
    }
  }
  assert.ok(errCases > 0 && okCases > 100, `phủ không đủ: ok=${okCases}, err=${errCases}`);
});

test('fuzz: dữ liệu rỗng và đầu vào cố định', () => {
  for (const o of [{}, { topN: 0 }, { topN: 1 }, { from: '2025-01' }, { to: '2025-01', from: '2026-01' }]) {
    assert.deepStrictEqual(buildReport([], [], o), legacy([], [], o));
    assert.deepStrictEqual(buildReport([], [{ sku: 'A', name: 'a', category: 'c' }], o), legacy([], [{ sku: 'A', name: 'a', category: 'c' }], o));
  }
});
