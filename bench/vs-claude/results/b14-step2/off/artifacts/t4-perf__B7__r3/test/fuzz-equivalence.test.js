'use strict';
// Fuzz/differential: so buildReport (src/report.js) với bản cũ (fixtures/report.legacy.js).
// PRNG tự viết, seed cố định -> tái lập được. Dữ liệu hoàn toàn giả.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportLegacy } = require('./fixtures/report.legacy');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled', 'pending', 'PAID', '', undefined];
const DATES = [
  '2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z', '2025-01-31T23:00:00-05:00', '2025-02-01T00:00:00+07:00',
  '2025-02-28T23:59:59.999Z', '2024-02-29T12:00:00Z', '2025-03-01T00:00:00+14:00', '2025-12-31T23:30:00-03:00',
  '2026-01-01T00:00:00Z', '2025-06-15T08:30:00.123+05:30', '2025-07-31T20:00:00-08:00', '2025-04-30T23:59:59Z',
];

function genCase(seed, { allowInvalidDate = false } = {}) {
  const r = mulberry32(seed);
  const pick = (n) => Math.floor(r() * n);
  const oneOf = (arr) => arr[pick(arr.length)];

  const nProd = pick(12);
  const nSku = Math.max(1, nProd + pick(3)); // có sku không có trong products
  const cats = ['food', 'toys', 'unknown', 'a', 'b', '', 'Z'];
  const products = Array.from({ length: nProd }, () => {
    const p = { sku: `S${pick(nSku)}`, name: `N${pick(50)}`, category: oneOf(cats) };
    const x = r();
    if (x < 0.08) delete p.category;
    else if (x < 0.12) delete p.name;
    return p;
  });

  const nOrd = r() < 0.06 ? 0 : pick(r() < 0.05 ? 2000 : 200) + 1;
  const nCust = 1 + pick(15);
  const nId = 1 + pick(Math.max(2, nOrd));
  const qtys = [0, 1, 2, 3, 5, -1, -3, 0.5, 2.5, 1.25, NaN, Infinity, -0];
  const prices = [0, 1, 99, 100, 250, 1999, 0.1, 19.99, 33.333, 1e15, NaN, -Infinity, -0, -50];
  const pickNum = (arr, wild) => (r() < wild ? oneOf(arr) : arr[pick(5)]);
  const wild = r() < 0.5 ? 0.02 : 0.25;

  const orders = Array.from({ length: nOrd }, () => {
    const o = {
      id: r() < 0.03 ? undefined : r() < 0.1 ? pick(nId) : `o${pick(nId)}`,
      customerId: r() < 0.03 ? undefined : r() < 0.1 ? pick(nCust) : `c${pick(nCust)}`,
      sku: r() < 0.03 ? NaN : `S${pick(nSku)}`,
      qty: pickNum(qtys, wild),
      unitPrice: pickNum(prices, wild),
      date: oneOf(DATES),
      status: oneOf(STATUSES),
    };
    const x = r();
    if (x < 0.02) delete o.qty;
    else if (x < 0.04) o.extra = { a: 1 };
    if (allowInvalidDate && r() < 0.5) o.date = oneOf(['xx', '', 'not-a-date', undefined, null, '2025-13-45']);
    return o;
  });
  const optList = [
    undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 10 }, { topN: null },
    { from: '2025-02' }, { to: '2025-01' }, { from: '2025-02', to: '2025-06', topN: 2 },
    { from: '2025-06', to: '2025-02' }, { from: '2026-01' }, { from: '', to: '' },
  ];
  return { orders, products, optList };
}

function outcome(fn) {
  try { return { ok: fn() }; } catch (e) { return { err: e && e.constructor && e.constructor.name, msg: e && e.message }; }
}

function check(orders, products, opt, label) {
  const snapO = structuredClone(orders);
  const snapP = structuredClone(products);
  const exp = outcome(() => buildReportLegacy(orders, products, opt));
  const got = outcome(() => buildReport(orders, products, opt));
  assert.deepStrictEqual(got, exp, `${label}: kết quả/lỗi khác bản cũ`);
  assert.deepStrictEqual(orders, snapO, `${label}: orders bị biến đổi`);
  assert.deepStrictEqual(products, snapP, `${label}: products bị biến đổi`);
}

test('fuzz: 300 bộ dữ liệu hợp lệ (seed cố định) khớp bản cũ', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const c = genCase(seed * 7919);
    for (const opt of c.optList) check(c.orders, c.products, opt, `seed=${seed * 7919} opt=${JSON.stringify(opt)}`);
  }
});

test('fuzz: ngày không hợp lệ -> cùng loại lỗi (RangeError) và cùng thông điệp', () => {
  let thrown = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const c = genCase(seed * 104729, { allowInvalidDate: true });
    for (const opt of [undefined, { from: '2025-02' }, { to: '2025-01', topN: 1 }]) {
      const exp = outcome(() => buildReportLegacy(c.orders, c.products, opt));
      if (exp.err) { thrown++; assert.equal(exp.err, 'RangeError'); }
      check(c.orders, c.products, opt, `seed=${seed * 104729}`);
    }
  }
  assert.ok(thrown > 0, 'phải có ít nhất một ca ném lỗi');
});

test('ca biên cố định: mảng rỗng, NaN/Infinity/-0, sku trùng/thiếu, danh mục unknown', () => {
  check([], [], undefined, 'rỗng');
  check([], [{ sku: 'A', name: 'A', category: 'X' }], { topN: 5 }, 'orders rỗng');
  const products = [
    { sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'Y' },
    { sku: 'U', name: 'U', category: 'unknown' }, { sku: 'N', name: 'N', category: 'X' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const D = '2025-01-31T23:00:00-05:00';
  const orders = [
    mk('1', 'c1', 'A', 1, NaN, D, 'paid'),
    mk('2', 'c1', 'A', Infinity, 5, D, 'refunded'),
    mk('3', 'c2', 'U', -0, 10, D, 'refunded'),
    mk('4', 'c2', 'ZZ', 2, 0.1, D, 'paid'),
    mk('5', 'c3', 'N', 0.5, 19.99, D, 'weird'),
    mk('5', 'c3', NaN, 1, 1, D, 'paid'),
    mk('6', 'c3', 'A', -2, 7, D, 'paid'),
  ];
  for (const opt of [undefined, { topN: 1 }, { from: '2025-02' }]) check(orders, products, opt, `biên ${JSON.stringify(opt)}`);
  // tổng bằng 0
  check([mk('1', 'c', 'A', 1, 5, D, 'paid'), mk('2', 'c', 'A', 1, 5, D, 'refunded')], products, undefined, 'tổng 0');
  // ngày lỗi
  const bad = [mk('1', 'c', 'A', 1, 5, 'xx', 'paid')];
  assert.throws(() => buildReportLegacy(bad, products), RangeError);
  assert.throws(() => buildReport(bad, products), RangeError);
});
