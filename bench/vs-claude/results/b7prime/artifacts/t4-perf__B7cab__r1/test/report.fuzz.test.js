'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

// PRNG mulberry32 có seed cố định
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

const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'pending', 'weird'];
const CATS = ['Đồ uống', 'Văn phòng phẩm', 'Gia dụng', 'a', 'B', ''];
const MONTHS = ['2023-12', '2024-01', '2024-02', '2024-12', '2025-01', '2025-02', '2025-06', '2025-12', '2026-01'];
const EDGE_DATES = [
  '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00Z',
  '2025-03-01T00:30:00+07:00', '2025-02-28T23:30:00-05:00', '2024-12-31T23:59:59Z',
];

function genCase(seed) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (arr) => arr[int(arr.length)];

  const nProd = int(12);
  const products = [];
  for (let i = 0; i < nProd; i++) {
    products.push({ sku: 'S' + int(Math.max(1, nProd - 2)), name: 'N' + i, category: pick(CATS) }); // sku có thể trùng
  }
  const nCust = 1 + int(15);
  const nOrdId = 1 + int(40);
  const n = r() < 0.05 ? 0 : 5 + int(300);
  const orders = [];
  const badDate = r() < 0.08;
  const badAt = badDate ? int(Math.max(1, n)) : -1;
  for (let i = 0; i < n; i++) {
    let date;
    const k = r();
    if (k < 0.25) date = pick(EDGE_DATES);
    else date = pick(MONTHS) + '-' + String(1 + int(28)).padStart(2, '0') + 'T' + String(int(24)).padStart(2, '0') + ':00:00Z';
    if (i === badAt) date = pick(['not-a-date', '', 'xx-yy', undefined]);
    const q = r();
    const qty = q < 0.1 ? 0 : q < 0.2 ? -1 - int(3) : q < 0.3 ? int(10) + 0.5 : 1 + int(9);
    const p = r();
    const unitPrice = p < 0.1 ? 0 : p < 0.2 ? -(1 + int(500)) : p < 0.35 ? int(10000) / 4 : 1 + int(100000);
    orders.push({
      id: 'o' + int(nOrdId),
      customerId: 'c' + int(nCust),
      sku: r() < 0.15 ? 'X' + int(5) : 'S' + int(Math.max(1, nProd)),
      qty, unitPrice, date,
      status: pick(STATUSES),
    });
  }
  const options = {};
  const t = r();
  if (t < 0.2) options.topN = 0;
  else if (t < 0.4) options.topN = 1;
  else if (t < 0.55) options.topN = 1000;
  else if (t < 0.75) options.topN = 1 + int(5);
  if (r() < 0.4) options.from = pick(MONTHS);
  if (r() < 0.4) options.to = pick(MONTHS);
  return { orders, products, options };
}

function run(fn, c) {
  try { return { ok: true, v: fn(c.orders, c.products, c.options) }; }
  catch (e) { return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message }; }
}

const N = 300;

test(`differential ngẫu nhiên có seed: ${N} bộ dữ liệu`, () => {
  let errors = 0;
  for (let seed = 1; seed <= N; seed++) {
    const c = genCase(seed);
    const before = structuredClone(c);
    const a = run(buildReport, c);
    const b = run(legacy.buildReport, c);
    const ctx = `seed=${seed}`;
    assert.deepStrictEqual(c, before, `${ctx}: đầu vào bị mutate`);
    assert.equal(a.ok, b.ok, `${ctx}: một bản ném lỗi, bản kia không (${JSON.stringify([a, b])})`);
    if (a.ok) assert.deepStrictEqual(a.v, b.v, ctx);
    else {
      errors++;
      assert.equal(a.name, b.name, `${ctx}: khác loại lỗi`);
      assert.equal(a.message, b.message, `${ctx}: khác message lỗi`);
    }
  }
  assert.ok(errors > 0, 'phải có ít nhất một bộ ném lỗi do ngày sai');
});

test('differential: input rỗng và không truyền options', () => {
  for (const opt of [undefined, {}, { topN: 0 }, { from: '2025-01', to: '2025-12' }]) {
    const a = run(buildReport, { orders: [], products: [], options: opt });
    const b = run(legacy.buildReport, { orders: [], products: [], options: opt });
    assert.deepStrictEqual(a, b);
  }
});
