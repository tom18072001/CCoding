'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const ref = require('./report.reference').buildReport;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00Z',
  '2025-01-31T23:30:00-05:00', '2025-02-01T00:30:00+07:00', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
  '2025-03-15T12:00:00Z', '2025-06-30T23:59:59Z', '2025-07-01T00:00:00Z', '2025-07-10T08:00:00+00:00',
];
const STATUSES = ['paid', 'refunded', 'cancelled', 'paid', 'paid', 'pending', undefined];
const SKUS = ['A', 'B', 'C', 'D', 'E', 'X', 'Z-missing'];
const WEIRD_NUM = [0, -1, -5, 1, 2, 3, 10, NaN, Infinity, -Infinity, -0];

function genData(seed, n) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = [
    { sku: 'A', name: 'Trà', category: 'Đồ uống' },
    { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
    { sku: 'A', name: 'Trùng A', category: 'Khác' },
    { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
    { sku: 'D', name: 'Thật unknown', category: 'unknown' },
    { sku: 'E', name: 'Không danh mục' },
  ];
  if (r() < 0.3) products.push({ sku: 'X', name: 'X', category: NaN });
  const orders = [];
  for (let i = 0; i < n; i++) {
    const o = {
      id: 'o' + Math.floor(r() * (n / 2 + 1)),
      customerId: 'c' + Math.floor(r() * 6),
      sku: pick(SKUS),
      qty: r() < 0.25 ? pick(WEIRD_NUM) : 1 + Math.floor(r() * 5),
      unitPrice: r() < 0.15 ? pick(WEIRD_NUM) : 100 * (1 + Math.floor(r() * 20)),
      date: pick(DATES),
      status: pick(STATUSES),
    };
    // trường thiếu
    const k = r();
    if (k < 0.04) delete o.customerId;
    else if (k < 0.07) delete o.sku;
    else if (k < 0.09) delete o.id;
    else if (k < 0.11) delete o.qty;
    else if (k < 0.13) delete o.unitPrice;
    else if (k < 0.15) o.customerId = null;
    orders.push(o);
  }
  return { orders, products };
}

const OPTS = [
  undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 5 }, { topN: 100 },
  { from: '2025-01' }, { to: '2025-02' }, { from: '2025-01', to: '2025-01' },
  { from: '2025-02', to: '2025-01' }, { from: '2025-03', to: '2025-07', topN: 2 },
  { from: '2030-01' }, { to: '2000-01' }, { topN: undefined, from: undefined },
];

function run(fn, d, o) {
  try {
    return { ok: fn(d.orders, d.products, o) };
  } catch (e) {
    return { err: e.constructor.name };
  }
}

function compare(d, o, label) {
  const before = JSON.stringify(d);
  const a = run(ref, d, o);
  const b = run(buildReport, d, o);
  assert.strictEqual(JSON.stringify(d), before, 'đầu vào bị sửa: ' + label);
  assert.deepStrictEqual(b, a, label);
  if (a.ok) assert.strictEqual(JSON.stringify(b.ok), JSON.stringify(a.ok), label);
}

test('fuzz: đầu vào rỗng và 1 dòng', () => {
  const prods = [{ sku: 'A', name: 'Trà', category: 'Đồ uống' }];
  const one = { id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 100, date: '2025-01-31T23:59:59Z', status: 'paid' };
  for (const o of OPTS) {
    compare({ orders: [], products: [] }, o, 'rỗng');
    compare({ orders: [], products: prods }, o, 'rỗng+sp');
    compare({ orders: [one], products: [] }, o, '1 dòng không sp');
    compare({ orders: [one], products: prods }, o, '1 dòng');
    for (const st of ['paid', 'refunded', 'cancelled', 'weird']) compare({ orders: [{ ...one, status: st }], products: prods }, o, '1 dòng ' + st);
  }
});

test('fuzz: ngẫu nhiên có seed cố định', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const d = genData(seed, seed % 5 === 0 ? 3 : 25 + (seed % 7) * 10);
    OPTS.forEach((o, i) => compare(d, o, `seed=${seed} opts#${i} ${JSON.stringify(o)}`));
  }
});

test('fuzz: ngày không hợp lệ ném cùng loại lỗi', () => {
  const base = { id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 100, status: 'paid' };
  const prods = [{ sku: 'A', name: 'Trà', category: 'Đồ uống' }];
  for (const date of ['not-a-date', '', undefined]) {
    compare({ orders: [{ ...base, date }], products: prods }, {}, 'date=' + date);
  }
});
