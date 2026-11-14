'use strict';
// Fuzz đối chiếu buildReport (bản mới) với bản cũ (test/report.legacy.js) trên dữ liệu ngẫu nhiên có seed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

// mulberry32: PRNG có seed
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

const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled', 'weird', undefined, ''];
const TZ = ['Z', '+00:00', '+07:00', '-05:00', '+14:00', '-12:00', '+05:30'];

function makeData(seed) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (arr) => arr[int(arr.length)];
  const nProd = 1 + int(25);
  const cats = ['A', 'B', 'C', 'Đồ uống', 'unknown', '', 'a'];
  const products = [];
  for (let i = 0; i < nProd; i++) {
    const p = { sku: 'S' + int(nProd + 3), name: 'n' + i, category: pick(cats) };
    if (r() < 0.1) delete p.category;
    if (r() < 0.05) delete p.name;
    products.push(p);
  }
  if (r() < 0.5) products.push({ sku: products[0].sku, name: 'dup', category: 'Dup' }); // sku trùng
  const nOrd = 300 + int(1500);
  const nCust = 1 + int(40);
  const orders = [];
  for (let i = 0; i < nOrd; i++) {
    const month = 1 + int(12);
    const day = 1 + int(28);
    const edge = r() < 0.15; // sát ranh giới tháng
    const d = edge ? (r() < 0.5 ? 1 : 28) : day;
    const hh = edge ? pick([0, 23]) : int(24);
    const date = `${pick([2024, 2025, 2025, 2025])}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(int(60)).padStart(2, '0')}:00${pick(TZ)}`;
    const o = {
      id: 'o' + int(Math.max(2, nOrd / 3)),
      customerId: 'c' + int(nCust),
      sku: r() < 0.1 ? 'NOPE' + int(3) : 'S' + int(nProd + 3),
      qty: pick([1, 2, 3, 5, 0, -1, -3, 1.5, 0.1, 7]),
      unitPrice: pick([100, 250, 999, 0, -100, 0.1, 0.2, 33.33, 1500, 12345]),
      date,
      status: pick(STATUSES),
    };
    // thiếu trường
    for (const f of ['id', 'customerId', 'sku', 'qty', 'unitPrice', 'status']) if (r() < 0.02) delete o[f];
    orders.push(o);
  }
  return { orders, products };
}

const OPTS = [
  {},
  { topN: 1 },
  { topN: 0 },
  { topN: 10 },
  { from: '2025-03', to: '2025-09' },
  { from: '2025-06' },
  { to: '2025-02', topN: 2 },
  { from: '2025-05', to: '2025-05' }, // ranh giới from = to
  { from: '2025-09', to: '2025-03' }, // from > to
  { from: '', to: '', topN: 4 },
  { topN: null },
  { from: '2024-01', to: '2025-12' },
];

function run(fn, ...args) {
  try {
    return { ok: true, value: fn(...args) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

function compare(label, orders, products, opts) {
  const a = run(buildReport, orders, products, opts);
  const b = run(legacy, orders, products, opts);
  assert.equal(a.ok, b.ok, `${label}: một bên ném lỗi, bên kia không (mới: ${a.message}, cũ: ${b.message})`);
  if (a.ok) assert.deepStrictEqual(a.value, b.value, label);
  else assert.deepStrictEqual({ name: a.name, message: a.message }, { name: b.name, message: b.message }, label);
}

test('fuzz: 20 seed × nhiều bộ options, giống hệt bản cũ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { orders, products } = makeData(seed * 7919);
    OPTS.forEach((o, i) => compare(`seed=${seed * 7919} opts#${i} ${JSON.stringify(o)}`, orders, products, o));
  }
});

test('fuzz: đầu vào rỗng / products rỗng / không có options', () => {
  const { orders } = makeData(5);
  compare('orders rỗng', [], [], {});
  compare('products rỗng', orders, [], {});
  compare('options mặc định', orders, [{ sku: 'S1', name: 'x', category: 'A' }]);
});

test('fuzz: date không hợp lệ ném cùng lỗi', () => {
  const base = { id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 10, status: 'paid' };
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  for (const date of ['not-a-date', undefined, '', 'Z', '2025-13-45T00:00:00Z']) {
    compare(`date=${String(date)}`, [{ ...base, date: '2025-01-01T00:00:00Z' }, { ...base, date }], products, {});
  }
});

test('fuzz: dòng bị lọc/cancelled không ảnh hưởng, dù date đặc biệt', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const orders = [
    { id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 10, date: '2025-01-01T00:00:00Z', status: 'cancelled' },
    { id: 'o2', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 10, date: '2025-01-31T23:59:59-01:00', status: 'paid' },
    { id: 'o3', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 10, date: '2025-02-28T23:59:59.999Z', status: 'refunded' },
  ];
  for (const o of OPTS) compare(`biên ${JSON.stringify(o)}`, orders, products, o);
});
