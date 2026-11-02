'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

// PRNG mulberry32 với seed cố định
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['paid', 'refunded', 'cancelled'];
const ZONES = ['Z', '+07:00', '-05:00', '+00:00', '-11:30', '+14:00'];
const TOPNS = [undefined, 0, 1, 3, 1000];
const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2026-01', '1999-01'];

function genCase(seed) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (arr) => arr[int(arr.length)];

  const nProd = r() < 0.1 ? 0 : 1 + int(8);
  const products = [];
  for (let i = 0; i < nProd; i++) {
    const p = { sku: 'S' + int(6), name: 'N' + int(5) };
    if (r() > 0.2) p.category = pick(['Đồ uống', 'Bút', 'Khác', 'a', 'B']);
    products.push(p);
  }
  if (products.length && r() < 0.4) products.push({ ...products[0], name: 'dup', category: 'Trùng' });

  const nOrd = r() < 0.08 ? 0 : 5 + int(296);
  const nIds = 1 + int(30);
  const orders = [];
  for (let i = 0; i < nOrd; i++) {
    const day = pick([1, 1, 28, 30, 31, 15]);
    const mon = pick(['01', '02', '03', '04', '12']);
    const yr = pick(['2024', '2025', '2025', '2026']);
    const hh = pick(['00', '00', '23', '12', '01']);
    const mm = pick(['00', '59', '30']);
    const d = Math.min(day, mon === '02' ? 28 : 30);
    const date = `${yr}-${mon}-${String(d).padStart(2, '0')}T${hh}:${mm}:00${pick(ZONES)}`;
    const qtyR = r();
    const qty = qtyR < 0.15 ? 0 : qtyR < 0.3 ? -(1 + int(3)) : 1 + int(6);
    orders.push({
      id: 'o' + int(nIds),
      customerId: 'c' + int(12),
      sku: r() < 0.15 ? 'MISSING' + int(3) : 'S' + int(6),
      qty,
      unitPrice: pick([0, 100, 250, 999, 1000, 12345]),
      date,
      status: pick(STATUSES),
    });
  }
  const opts = {};
  const t = pick(TOPNS);
  if (t !== undefined || r() < 0.3) opts.topN = t;
  const fr = r();
  if (fr < 0.25) opts.from = pick(MONTHS);
  else if (fr < 0.5) opts.to = pick(MONTHS);
  else if (fr < 0.75) {
    opts.from = pick(MONTHS);
    opts.to = pick(MONTHS); // có thể đảo ngược / ngoài phạm vi
  }
  return { orders, products, opts };
}

test('fuzz: 200 bộ dữ liệu giống hệt bản cũ', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { orders, products, opts } = genCase(seed);
    let expected;
    let expectedErr;
    try { expected = legacy(orders, products, opts); } catch (e) { expectedErr = e; }
    let actual;
    let actualErr;
    try { actual = buildReport(orders, products, opts); } catch (e) { actualErr = e; }
    assert.equal(!!actualErr, !!expectedErr, `seed ${seed}: khác biệt về việc ném lỗi`);
    if (!expectedErr) assert.deepStrictEqual(actual, expected, `seed ${seed}`);
  }
});

test('fuzz: mọi tổ hợp topN/from/to trên một bộ dữ liệu', () => {
  const { orders, products } = genCase(77);
  const froms = [undefined, '2025-01', '2025-03', '2030-01', '1990-01'];
  const tos = [undefined, '2025-01', '2025-03', '2030-01', '1990-01'];
  for (const topN of TOPNS) for (const from of froms) for (const to of tos) {
    const o = { topN, from, to };
    assert.deepStrictEqual(buildReport(orders, products, o), legacy(orders, products, o), JSON.stringify(o));
  }
});

test('ca biên: hoàn tiền qty=0 (-0), rỗng, sát biên tháng UTC', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const cases = [
    [[{ id: 'o', customerId: 'c', sku: 'A', qty: 0, unitPrice: 100, date: '2025-01-01T00:00:00Z', status: 'refunded' }], products],
    [[{ id: 'o', customerId: 'c', sku: 'A', qty: 2, unitPrice: 0, date: '2025-01-01T00:00:00Z', status: 'refunded' }], products],
    [[], []],
    [[], products],
    [[{ id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-02-01T00:30:00+07:00', status: 'paid' },
      { id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-31T23:30:00-05:00', status: 'paid' },
      { id: 'p', customerId: 'd', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-31T23:59:59Z', status: 'paid' }], products],
  ];
  for (const [o, p] of cases) {
    for (const opts of [{}, { from: '2025-02' }, { to: '2025-01' }, { topN: 0 }]) {
      assert.deepStrictEqual(buildReport(o, p, opts), legacy(o, p, opts));
    }
  }
});

test('đầu vào không bị sửa', () => {
  for (const seed of [3, 11, 59]) {
    const { orders, products, opts } = genCase(seed);
    const o0 = structuredClone(orders);
    const p0 = structuredClone(products);
    const op0 = structuredClone(opts);
    buildReport(orders, products, opts);
    assert.deepStrictEqual(orders, o0);
    assert.deepStrictEqual(products, p0);
    assert.deepStrictEqual(opts, op0);
  }
});

test('ngày không hợp lệ ném cùng lỗi ở cả hai bản', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  for (const date of ['không phải ngày', '', '2025-13-45T00:00:00Z', undefined]) {
    const orders = [
      { id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' },
      { id: 'p', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date, status: 'paid' },
    ];
    let e1;
    let e2;
    try { legacy(orders, products); } catch (e) { e1 = e; }
    try { buildReport(orders, products); } catch (e) { e2 = e; }
    assert.ok(e1, 'bản cũ phải ném lỗi');
    assert.ok(e2, 'bản mới phải ném lỗi');
    assert.equal(e2.constructor, e1.constructor);
    assert.equal(e2.message, e1.message);
  }
});
