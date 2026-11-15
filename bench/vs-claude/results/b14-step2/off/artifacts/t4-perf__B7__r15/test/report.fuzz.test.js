'use strict';
// Fuzz: so sánh buildReport hiện tại với bản cũ (test/report.legacy.js) trên dữ liệu ngẫu nhiên có seed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

const SEEDS = 30;

function prng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DATES = [
  '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-01-31T23:30:00-05:00', '2025-02-01T00:00:00+07:00',
  '2025-03-01T00:30:00+01:00', '2025-02-28T23:59:59.999Z', '2024-12-31T23:00:00-02:00', '2025-12-31T20:00:00-05:00',
  '2025-06-15T12:00:00Z', '2025-07-01T00:00:00+14:00', '2025-04-30T23:59:59-12:00', '2026-01-01T00:00:00Z',
];

function genCase(seed) {
  const r = prng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (arr) => arr[int(arr.length)];
  const nProducts = int(15);
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    const p = { sku: 'S' + int(12), name: r() < 0.1 ? null : 'N' + int(20), category: r() < 0.1 ? null : pick(['A', 'B', 'C', 'Đồ uống', 'a'])};
    if (r() < 0.05) delete p.name;
    products.push(p);
  }
  const n = seed === 0 ? 0 : seed === 1 ? 1 : int(5001);
  const orders = [];
  for (let i = 0; i < n; i++) {
    let qty = r() < 0.1 ? -1 - int(4) : r() < 0.08 ? 0 : 1 + int(9);
    let unitPrice = r() < 0.1 ? 0 : 100 * (1 + int(50)) + (r() < 0.3 ? int(100) : 0);
    if (r() < 0.04) qty = String(qty);
    if (r() < 0.04) unitPrice = String(unitPrice);
    orders.push({
      id: 'o' + int(Math.max(1, n / 2)),
      customerId: r() < 0.02 ? null : 'c' + int(40),
      sku: r() < 0.1 ? 'X' + int(5) : 'S' + int(14),
      qty,
      unitPrice,
      date: r() < 0.6 ? pick(DATES) : new Date(Date.UTC(2025, int(12), 1 + int(28), int(24), int(60))).toISOString(),
      status: pick(['paid', 'paid', 'paid', 'refunded', 'cancelled']),
    });
  }
  const months = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-06', '2025-12', '2026-01', '2030-01'];
  const opts = {};
  if (r() < 0.6) opts.topN = pick([0, 1, 2, 3, 5, 10, 100]);
  if (r() < 0.4) opts.from = pick(months);
  if (r() < 0.4) opts.to = pick(months);
  return { orders, products, opts };
}

function run(fn, a, b, c) {
  try {
    return { ok: fn(a, b, c) };
  } catch (e) {
    return { err: { name: e && e.name, message: e && e.message, ctor: e && e.constructor } };
  }
}

test(`fuzz: ${SEEDS} seed giống hệt bản cũ`, () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    const { orders, products, opts } = genCase(seed);
    assert.deepStrictEqual(run(buildReport, orders, products, opts), run(legacy, orders, products, opts), `seed ${seed}`);
    assert.deepStrictEqual(buildReport(orders, products), legacy(orders, products), `seed ${seed} (mặc định)`);
  }
});

test('fuzz: danh sách rỗng và products rỗng', () => {
  for (const o of [{}, { topN: 0 }, { from: '2025-01', to: '2025-02' }]) {
    assert.deepStrictEqual(buildReport([], [], o), legacy([], [], o));
  }
  const { orders } = genCase(7);
  assert.deepStrictEqual(buildReport(orders, []), legacy(orders, []));
});

test('fuzz: lỗi giống bản cũ (cùng loại, cùng message)', () => {
  const base = { id: '1', customerId: 'c', sku: 'S1', qty: 1, unitPrice: 10, status: 'paid' };
  const products = [{ sku: 'S1', name: 'n', category: 'A' }];
  for (const date of ['bad', '', undefined, null, '2025-13-45', NaN]) {
    const orders = [{ ...base, date: '2025-01-01T00:00:00Z' }, { ...base, date }];
    const a = run(buildReport, orders, products, {});
    const b = run(legacy, orders, products, {});
    assert.deepStrictEqual(a, b, `date=${String(date)}`);
  }
  // date lỗi nhưng dòng bị lọc/huỷ vẫn ném lỗi ở bản cũ -> phải giống
  const o2 = [{ ...base, status: 'cancelled', date: 'bad' }];
  assert.deepStrictEqual(run(buildReport, o2, products, {}), run(legacy, o2, products, {}));
});
