'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;

// PRNG mulberry32 với seed cố định -> tái lập được
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

const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled', 'pending', 'PAID', undefined, null, ''];
const DATES = [
  '2025-01-31T23:59:59Z',
  '2025-02-01T00:00:00+07:00',
  '2025-02-01T00:00:00.123Z',
  '2025-12-31T23:00:00-05:00',
  '2024-06-15T12:30:00+00:00',
  '2025-03-01T00:00:00-00:30',
  '2026-01-01T00:00:00Z',
  '2025-07-04',
  '2025-07',
  '2024-02-29T10:00:00Z',
  'Mon, 03 Mar 2025 10:00:00 GMT',
  '2025-09-30T23:59:59.999Z',
];
const AMOUNT_KINDS = ['int', 'zero', 'neg', 'float', 'big'];

function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

function genCase(seed) {
  const r = prng(seed);
  const kind = seed % 10;
  const nProducts = kind === 0 ? 0 : 1 + Math.floor(r() * 25);
  const nSkuOrders = nProducts + 1 + Math.floor(r() * 5); // có sku không có trong products
  const nCats = 1 + Math.floor(r() * 8);
  const nCust = 1 + Math.floor(r() * 30);
  const nOrdIds = 1 + Math.floor(r() * 60);
  const n = kind === 1 ? 0 : kind === 2 ? 1 : Math.floor(r() * 250);

  const products = [];
  for (let i = 0; i < nProducts; i++) {
    const p = { sku: `S${i}`, name: `Tên ${i}`, category: `Cat${Math.floor(r() * nCats)}` };
    if (r() < 0.05) delete p.category;
    products.push(p);
    if (r() < 0.15) products.push({ sku: p.sku, name: `Trùng ${i}`, category: `Cat${Math.floor(r() * nCats)}` }); // sku trùng
  }
  if (r() < 0.5) products.sort(() => r() - 0.5);

  const dates = DATES.slice(0, 2 + Math.floor(r() * (DATES.length - 1)));
  const orders = [];
  for (let i = 0; i < n; i++) {
    const ak = pick(r, AMOUNT_KINDS);
    let qty = 1 + Math.floor(r() * 5);
    let unitPrice = 100 * Math.floor(r() * 200);
    if (ak === 'zero') (r() < 0.5 ? (qty = 0) : (unitPrice = 0));
    else if (ak === 'neg') unitPrice = -unitPrice;
    else if (ak === 'float') {
      unitPrice = Math.round(r() * 1e5) / 100 + 0.1;
      qty = Math.round(r() * 300) / 7;
    } else if (ak === 'big') {
      qty = Math.floor(r() * 1e6);
      unitPrice = Math.floor(r() * 1e6);
    }
    orders.push({
      id: `o${Math.floor(r() * nOrdIds)}`,
      customerId: `c${Math.floor(r() * nCust)}`,
      sku: `S${Math.floor(r() * nSkuOrders)}`,
      qty,
      unitPrice,
      date: pick(r, dates),
      status: pick(r, STATUSES),
    });
  }
  // xáo trộn (Fisher–Yates)
  for (let i = orders.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [orders[i], orders[j]] = [orders[j], orders[i]];
  }
  return { orders, products, r };
}

const OPTIONS = [
  undefined,
  {},
  { topN: 0 },
  { topN: 1 },
  { topN: 2 },
  { topN: 10 },
  { from: '2025-02' },
  { to: '2025-02' },
  { from: '2025-01', to: '2025-03' },
  { from: '2025-02', to: '2025-02' },
  { from: '2025-09', to: '2025-03' },
  { from: '2024-01', to: '2026-12', topN: 2 },
  { from: '', to: '' },
];

function check(orders, products, options, label) {
  const snap = JSON.stringify([orders, products]);
  const actual = buildReport(orders, products, options);
  const expected = legacy(orders, products, options);
  assert.deepStrictEqual(actual, expected, label);
  // thứ tự khóa (deepStrictEqual không kiểm tra thứ tự khóa của object)
  assert.deepStrictEqual(Object.keys(actual), Object.keys(expected), `${label} keys`);
  assert.deepStrictEqual(actual.months, expected.months, `${label} months`);
  assert.deepStrictEqual(actual.categories.map((c) => Object.keys(c.byMonth)), expected.categories.map((c) => Object.keys(c.byMonth)), `${label} byMonth keys`);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label} JSON`);
  assert.equal(JSON.stringify([orders, products]), snap, `${label} đầu vào bị sửa`);
}

test('fuzz: 400 bộ dữ liệu ngẫu nhiên (seed cố định) × tùy chọn khác nhau', () => {
  const started = Date.now();
  let cases = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { orders, products, r } = genCase(seed);
    const opts = [OPTIONS[0], pick(r, OPTIONS), pick(r, OPTIONS)];
    for (const o of opts) {
      check(orders, products, o, `seed=${seed} options=${JSON.stringify(o)}`);
      cases++;
    }
  }
  assert.ok(cases >= 1200);
  assert.ok(Date.now() - started < 10000, 'quá 10 giây');
});

test('fuzz: ca biên cố định (rỗng, 1 dòng, mọi trạng thái, hòa điểm)', () => {
  check([], [], undefined, 'rỗng');
  check([], [{ sku: 'A', name: 'a', category: 'c' }], { topN: 0 }, 'chỉ products');
  const one = { id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 150, date: '2025-05-05T00:00:00Z', status: 'paid' };
  const prods = [{ sku: 'A', name: 'a', category: 'c' }];
  for (const status of ['paid', 'refunded', 'cancelled', 'pending', undefined]) check([{ ...one, status }], prods, undefined, `1 dòng ${status}`);
  // hòa doanh thu/qty -> so sánh theo sku, customerId, category
  const tie = [];
  for (const sku of ['B', 'A', 'C']) for (const c of ['z', 'y', 'x']) tie.push({ ...one, id: `${sku}${c}`, customerId: c, sku });
  check(tie, [{ sku: 'A', name: 'a', category: 'k2' }, { sku: 'B', name: 'b', category: 'k1' }, { sku: 'C', name: 'c', category: 'k1' }], undefined, 'hòa điểm');
  // tổng bằng 0 -> share = 0
  check([one, { ...one, id: 'o2', status: 'refunded' }], prods, undefined, 'tổng 0');
});
