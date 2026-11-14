'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản cũ (test/report.legacy.js).
// PRNG mulberry32 có seed cố định để tái hiện được.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

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

const STATUSES = ['paid', 'refunded', 'cancelled'];
// ngày sát ranh giới tháng (UTC), gồm cả múi giờ lệch làm đổi tháng
const DATES = [
  '2024-12-31T23:59:59.999Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z', '2025-02-01T00:00:00.000Z',
  '2025-01-31T23:30:00-05:00', '2025-02-01T00:30:00+07:00', '2025-02-28T23:59:59Z', '2025-03-01T00:00:00Z',
  '2025-03-15T12:00:00Z', '2025-06-30T23:59:59.999Z', '2025-07-01T00:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
];
const MONTHS = ['2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-06', '2025-07', '2025-12', '2026-01', '2026-02'];

function makeCase(seed) {
  const rnd = mulberry32(seed);
  const int = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[int(arr.length)];

  const nSkus = 1 + int(8);
  const nCats = 1 + int(4);
  const nCust = 1 + int(10);
  const nIds = 1 + int(15);
  const cats = Array.from({ length: nCats }, (_, i) => (rnd() < 0.5 ? `cat${i}` : `Danh mục ${i}`));
  const products = [];
  for (let i = 0; i < nSkus; i++) products.push({ sku: `S${i}`, name: `Tên ${i}`, category: pick(cats) });
  if (rnd() < 0.5 && products.length) products.push({ sku: products[0].sku, name: 'Trùng', category: pick(cats) }); // sku trùng
  if (rnd() < 0.2) products.length = 0;

  const kind = int(10);
  const nOrders = kind === 0 ? 0 : kind === 1 ? 1 : 1 + int(120);
  const price = () => {
    const r = rnd();
    if (r < 0.1) return 0;
    if (r < 0.2) return -(1 + int(500));
    if (r < 0.5) return Math.round(rnd() * 100000) / 7; // số thực lẻ
    return 1 + int(5000);
  };
  const qty = () => {
    const r = rnd();
    if (r < 0.1) return 0;
    if (r < 0.2) return -(1 + int(5));
    if (r < 0.35) return Math.round(rnd() * 1000) / 13;
    return 1 + int(9);
  };
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    orders.push({
      id: `o${int(nIds)}`,
      customerId: `c${int(nCust)}`,
      sku: rnd() < 0.1 ? 'KHONG_CO' : `S${int(nSkus + 1)}`,
      qty: qty(),
      unitPrice: price(),
      date: pick(DATES),
      status: pick(STATUSES),
    });
  }

  const options = {};
  const t = int(7);
  if (t === 0) options.topN = 0;
  else if (t === 1) options.topN = 1;
  else if (t === 2) options.topN = 2;
  else if (t === 3) options.topN = 100;
  else if (t === 4) options.topN = undefined;
  if (rnd() < 0.5) options.from = pick(MONTHS);
  if (rnd() < 0.5) options.to = pick(MONTHS);
  return { orders, products, options };
}

test('fuzz: buildReport giống hệt bản cũ (seed cố định)', () => {
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const { orders, products, options } = makeCase(seed);
    const got = buildReport(orders, products, options);
    const want = legacy(orders, products, options);
    try {
      assert.deepStrictEqual(got, want);
      // deepStrictEqual không phân biệt thứ tự khóa của object: so thêm bằng JSON
      assert.equal(JSON.stringify(got), JSON.stringify(want));
    } catch (e) {
      e.message = `Lệch ở seed=${seed} options=${JSON.stringify(options)}\n${e.message}`;
      throw e;
    }
  }
});

test('fuzz: ngày không hợp lệ ném cùng loại lỗi như bản cũ', () => {
  const base = { id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 100, status: 'paid' };
  const products = [{ sku: 'A', name: 'Trà', category: 'X' }];
  for (const date of ['không phải ngày', '', 'invalid']) {
    const orders = [{ ...base, date: '2025-01-01T00:00:00Z' }, { ...base, date }];
    let a, b;
    try { buildReport(orders, products, {}); } catch (e) { a = e; }
    try { legacy(orders, products, {}); } catch (e) { b = e; }
    assert.ok(a && b, 'cả hai phải ném lỗi');
    assert.equal(a.constructor, b.constructor);
    assert.equal(a.message, b.message);
  }
});
