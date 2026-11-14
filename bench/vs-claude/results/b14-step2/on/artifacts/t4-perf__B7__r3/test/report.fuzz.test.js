'use strict';
// Fuzz đối chiếu buildReport (bản tối ưu) với bản gốc test/report.legacy.js.
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

// PRNG có seed (mulberry32)
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

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

const DATES = [
  '2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z', '2025-02-01T00:00:00.000Z', '2025-02-28T23:59:59.999Z',
  '2025-03-31T23:30:00-05:00', '2025-04-01T01:00:00+07:00', '2025-04-30T20:00:00-04:00', '2025-05-01T00:30:00+02:00',
  '2024-12-31T23:59:59Z', '2024-12-31T20:00:00-08:00', '2025-12-31T23:59:59Z', '2026-01-01T05:00:00+09:00',
  '2024-02-29T12:00:00Z', '2025-06-15T12:00:00Z', '2025-07-10', '2025-08-31T23:00:00-01:00',
];
const BAD_DATES = ['không phải ngày', '', '2025-13-45T00:00:00Z', undefined, 'abc-01'];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-08', '2025-12', '2026-01', '2030-01', '2000-01'];

function num(r, normalChoices) {
  const x = r();
  if (x < 0.5) return pick(r, normalChoices);
  if (x < 0.6) return 0;
  if (x < 0.7) return -int(r, 1, 5);
  if (x < 0.8) return int(r, 1, 400) / 8 + 0.1;
  if (x < 0.87) return undefined;
  if (x < 0.93) return null;
  if (x < 0.95) return NaN;
  if (x < 0.97) return -0;
  return Infinity;
}

function genCase(seed, { allowBadDate }) {
  const r = rng(seed);
  const nProducts = r() < 0.05 ? 0 : int(r, 1, 12);
  const nCats = int(r, 1, 4);
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    products.push({ sku: 'S' + int(r, 0, 9), name: 'Tên ' + int(r, 0, 5), category: 'Cat' + int(r, 1, nCats) });
  }
  // SKU trùng: sao chép một sản phẩm với tên/danh mục khác
  if (products.length && r() < 0.5) products.push({ ...products[0], name: 'Trùng', category: 'Cat' + int(r, 1, nCats + 1) });
  const nOrders = r() < 0.05 ? 0 : int(r, 1, 120);
  const nCust = int(r, 1, 6);
  const nIds = int(r, 1, 30);
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    const o = {
      id: 'o' + int(r, 1, nIds),
      customerId: 'c' + int(r, 1, nCust),
      sku: r() < 0.15 ? 'X' + int(r, 0, 3) : 'S' + int(r, 0, 9), // SKU không rõ
      qty: num(r, [1, 2, 3, 5, 10]),
      unitPrice: num(r, [100, 250, 1000, 99999]),
      date: allowBadDate && r() < 0.5 ? pick(r, BAD_DATES) : pick(r, DATES),
      status: pick(r, STATUSES),
    };
    orders.push(o);
  }
  const opts = {};
  const k = r();
  if (k < 0.15) opts.topN = 0;
  else if (k < 0.3) opts.topN = 1000;
  else if (k < 0.6) opts.topN = int(r, 1, 5);
  else if (k < 0.65) opts.topN = undefined;
  if (r() < 0.4) opts.from = pick(r, MONTHS);
  if (r() < 0.4) opts.to = pick(r, MONTHS);
  return { orders, products, opts };
}

function run(fn, c) {
  try {
    return { value: fn(c.orders, c.products, c.opts) };
  } catch (e) {
    return { error: e };
  }
}

function compare(c, label) {
  const a = run(legacy.buildReport, c);
  const b = run(buildReport, c);
  if (a.error || b.error) {
    assert.ok(a.error && b.error, `${label}: chỉ một bên ném lỗi (legacy=${a.error}, new=${b.error})`);
    assert.strictEqual(b.error.constructor, a.error.constructor, label);
    assert.strictEqual(b.error.message, a.error.message, label);
    return 'error';
  }
  assert.deepStrictEqual(b.value, a.value, label);
  // thứ tự khóa (deepStrictEqual không kiểm): so sánh chuỗi JSON
  assert.strictEqual(JSON.stringify(b.value), JSON.stringify(a.value), label + ' (thứ tự khóa)');
  return 'ok';
}

test('fuzz: 300 bộ dữ liệu hợp lệ giống hệt bản gốc', () => {
  let ok = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const res = compare(genCase(seed, { allowBadDate: false }), `seed ${seed}`);
    if (res === 'ok') ok++;
  }
  assert.ok(ok >= 290, 'phần lớn ca phải chạy thành công, ok=' + ok);
});

test('fuzz: 100 bộ có ngày sai cho cùng loại lỗi với bản gốc', () => {
  let errors = 0;
  for (let seed = 1001; seed <= 1100; seed++) {
    if (compare(genCase(seed, { allowBadDate: true }), `seed ${seed}`) === 'error') errors++;
  }
  assert.ok(errors > 0, 'phải có ca ném lỗi');
});

test('fuzz: ca biên cố định', () => {
  const P = [{ sku: 'A', name: 'a', category: 'K' }];
  const mk = (over) => ({ id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-01T00:00:00Z', status: 'paid', ...over });
  const cases = [
    { orders: [], products: [], opts: {} },
    { orders: [], products: P, opts: { topN: 0, from: '2025-01' } },
    { orders: [mk({ status: 'cancelled' })], products: P, opts: {} },
    { orders: [mk({ qty: 0 }), mk({ qty: -2, status: 'refunded' })], products: P, opts: { topN: 0 } },
    { orders: [mk({ unitPrice: undefined }), mk({ qty: null })], products: P, opts: {} },
    { orders: [mk({ date: 'xxx', status: 'cancelled' })], products: P, opts: {} },
    { orders: [mk(), mk({ date: '2025-01-31T23:59:59-05:00' })], products: P, opts: { from: '2025-02', to: '2025-02' } },
    { orders: [mk({ sku: undefined, customerId: undefined, id: undefined })], products: P, opts: {} },
  ];
  cases.forEach((c, i) => compare(c, `biên #${i}`));
});
