'use strict';
// Fuzz đối chiếu buildReport mới với bản cũ (test/fixtures/report.legacy.js là đặc tả).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./fixtures/report.legacy');

// PRNG có seed cố định (mulberry32)
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

const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:30:00-05:00', '2025-02-01T00:00:00+07:00',
  '2025-02-28T23:59:59.999Z', '2025-03-01T00:00:00Z', '2025-03-31T20:00:00-04:00', '2025-06-15T12:00:00Z',
  '2025-12-31T23:59:59Z', '2025-12-31T20:00:00-08:00', '2026-01-01T00:00:00+14:00', '2026-01-01T00:00:00Z',
];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled'];
const QTYS = [0, 1, 1, 2, 3, 5, -1, -3];
const PRICES = [0, 100, 100, 250, 999, 12.5, 0.1, 0.2, 33.33, 1e6];

function gen(seed) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const nProducts = Math.floor(r() * 12);
  const nCats = 1 + Math.floor(r() * 4);
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    products.push({ sku: 'S' + Math.floor(r() * 10), name: 'N' + i, category: 'C' + Math.floor(r() * nCats) });
  } // sku có thể trùng
  const nOrders = seed % 7 === 0 ? 0 : Math.floor(r() * 400);
  const nCust = 1 + Math.floor(r() * 8);
  const nIds = 1 + Math.floor(r() * 60);
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    orders.push({
      id: 'o' + Math.floor(r() * nIds),
      customerId: 'c' + Math.floor(r() * nCust),
      sku: 'S' + Math.floor(r() * 14), // một số sku không có trong products
      qty: pick(QTYS),
      unitPrice: pick(PRICES),
      date: pick(DATES),
      status: pick(STATUSES),
    });
  }
  return { orders, products };
}

const OPTIONS = [
  {}, { topN: 0 }, { topN: 1 }, { topN: 5 }, { topN: 1000 },
  { from: '2025-02' }, { to: '2025-06' }, { from: '2025-01', to: '2025-03' },
  { from: '2025-03', to: '2025-03' }, { from: '2025-12', to: '2025-01' }, { from: '2030-01' }, { to: '2000-01' },
  { topN: 1, from: '2025-01', to: '2026-01' }, { topN: 5, to: '2025-12' }, { topN: 0, from: '2025-02' },
];

function run(fn, orders, products, opts) {
  try {
    return { ok: true, value: fn(orders, products, opts) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

function compare(orders, products, opts, label) {
  const a = run(legacy, orders, products, opts);
  const b = run(buildReport, orders, products, opts);
  assert.equal(b.ok, a.ok, `${label}: khác nhau về việc ném lỗi`);
  if (!a.ok) {
    assert.equal(b.name, a.name, `${label}: khác loại lỗi`);
    assert.equal(b.message, a.message, `${label}: khác message lỗi`);
    return;
  }
  assert.equal(JSON.stringify(b.value), JSON.stringify(a.value), `${label}: JSON khác nhau`);
  assert.deepStrictEqual(b.value, a.value, `${label}: deepStrictEqual khác nhau`);
}

test('fuzz: 40 seed x nhiều tùy chọn khớp bản cũ', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { orders, products } = gen(seed);
    for (const opts of OPTIONS) compare(orders, products, opts, `seed=${seed} opts=${JSON.stringify(opts)}`);
  }
});

test('fuzz: tie-break (giá trị bằng nhau giữa khách hàng/danh mục/sản phẩm)', () => {
  for (let seed = 100; seed < 120; seed++) {
    const r = rng(seed);
    const products = [];
    for (let i = 0; i < 8; i++) products.push({ sku: 'K' + i, name: 'P' + i, category: 'D' + (i % 3) });
    const orders = [];
    for (let i = 0; i < 200; i++) {
      orders.push({
        id: 'x' + Math.floor(r() * 30),
        customerId: 'u' + Math.floor(r() * 10),
        sku: 'K' + Math.floor(r() * 8),
        qty: 1,
        unitPrice: 100, // mọi dòng cùng giá trị -> nhiều hòa
        date: '2025-05-10T00:00:00Z',
        status: r() < 0.8 ? 'paid' : 'refunded',
      });
    }
    for (const opts of OPTIONS) compare(orders, products, opts, `tie seed=${seed} opts=${JSON.stringify(opts)}`);
  }
});

test('fuzz: đầu vào rỗng và ngày không hợp lệ (cùng loại lỗi, cùng message)', () => {
  for (const opts of OPTIONS) {
    compare([], [], opts, 'rỗng');
    compare([], [{ sku: 'A', name: 'a', category: 'c' }], opts, 'rỗng + products');
  }
  const base = { id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 10, status: 'paid' };
  const products = [{ sku: 'A', name: 'a', category: 'c' }];
  for (const date of ['bad', '', undefined, null, 'not-a-date', '2025-13-45']) {
    for (const status of ['paid', 'cancelled', 'refunded']) {
      compare([{ ...base, date: '2025-01-01T00:00:00Z' }, { ...base, status, date }], products, {}, `date=${String(date)}/${status}`);
      compare([{ ...base, status, date }], products, { from: '2030-01' }, `date=${String(date)}/${status}/from`);
    }
  }
});
