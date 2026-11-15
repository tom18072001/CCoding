'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản gốc (test/report.legacy.js). PRNG tự viết, seed cố định.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00Z',
  '2025-02-28T23:30:00Z', '2024-02-29T12:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
  '2025-01-31T20:00:00-05:00', '2025-02-01T03:00:00+07:00', '2025-03-01T06:30:00+07:00', '2025-06-15T10:00:00Z',
  '2025-07-01T00:00:00+00:00', '2025-04-30T23:00:00-02:00',
];
const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-06', '2025-07', '2025-12', '2026-01', '2030-01', '2000-01'];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];

function genCase(r, maxRows) {
  const pick = (n) => Math.floor(r() * n);
  const nProd = pick(8);
  const cats = ['A', 'B', 'C', 'Đồ uống', 'b', ''];
  const products = [];
  for (let i = 0; i < nProd; i++) products.push({ sku: `S${pick(6)}`, name: `N${i}`, category: cats[pick(cats.length)] });
  const nRows = pick(maxRows + 1);
  const nCust = 1 + pick(6);
  const orders = [];
  for (let i = 0; i < nRows; i++) {
    const zero = r() < 0.1;
    orders.push({
      id: `O${pick(Math.max(3, nRows / 2))}`,
      customerId: `C${pick(nCust)}`,
      sku: r() < 0.1 ? `X${pick(3)}` : `S${pick(6)}`, // đôi khi sku không có trong products
      qty: r() < 0.1 ? 0 : 1 + pick(5),
      unitPrice: zero ? 0 : r() < 0.05 ? -pick(500) : pick(3) * 100 + pick(5) * 10,
      date: DATES[pick(DATES.length)],
      status: STATUSES[pick(STATUSES.length)],
    });
  }
  const opts = {};
  if (r() < 0.5) opts.topN = [0, 1, 2, 3, 5, 10][pick(6)];
  if (r() < 0.4) opts.from = MONTHS[pick(MONTHS.length)];
  if (r() < 0.4) opts.to = MONTHS[pick(MONTHS.length)];
  return { orders, products, opts };
}

function run(fn, c) {
  try {
    return { ok: fn(c.orders, c.products, c.opts) };
  } catch (e) {
    return { err: e };
  }
}

function compare(c, label) {
  const a = run(buildReport, c);
  const b = run(legacy.buildReport, c);
  if (b.err) {
    assert.ok(a.err, `${label}: bản gốc ném lỗi nhưng bản mới không`);
    assert.strictEqual(a.err.constructor, b.err.constructor, label);
    assert.strictEqual(a.err.message, b.err.message, label);
    return;
  }
  assert.ok(!a.err, `${label}: bản mới ném lỗi: ${a.err && a.err.message}`);
  assert.deepStrictEqual(a.ok, b.ok, label);
  assert.strictEqual(JSON.stringify(a.ok), JSON.stringify(b.ok), `${label}: thứ tự khóa`);
}

test('fuzz: 300 bộ nhỏ (0–50 dòng) giống hệt bản gốc', () => {
  const r = mulberry(20261112);
  for (let i = 0; i < 300; i++) compare(genCase(r, 50), `small#${i}`);
});

test('fuzz: vài bộ lớn hơn giống hệt bản gốc', () => {
  const r = mulberry(777);
  for (let i = 0; i < 6; i++) {
    const c = genCase(r, 1500);
    while (c.orders.length < 800) c.orders.push(...genCase(r, 400).orders);
    compare(c, `large#${i}`);
  }
});

test('fuzz: đầu vào rỗng và ngày không hợp lệ cho cùng loại lỗi/thông điệp', () => {
  compare({ orders: [], products: [], opts: {} }, 'empty');
  const base = { id: 'o', customerId: 'c', sku: 'S1', qty: 1, unitPrice: 100, status: 'paid' };
  for (const date of ['không phải ngày', '', undefined, '2025-13-45']) {
    compare({ orders: [{ ...base, date }], products: [], opts: {} }, `bad date ${String(date)}`);
  }
});
