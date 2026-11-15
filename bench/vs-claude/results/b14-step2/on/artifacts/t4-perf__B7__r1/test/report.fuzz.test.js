'use strict';
// Fuzz đối chiếu bản mới (src/report.js) với bản cũ (đặc tả) trên dữ liệu ngẫu nhiên có seed cố định.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy');

// mulberry32
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

const pad = (n) => String(n).padStart(2, '0');

function gen(seed) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (a) => a[int(a.length)];

  const nProducts = pick([0, 1, 3, 10, 30]);
  const cats = ['Đồ uống', 'Văn phòng phẩm', 'a', 'B', 'z', 'Z', ''];
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    const p = { sku: 'S' + int(Math.max(1, nProducts)), name: 'Tên ' + int(5) };
    if (r() > 0.2) p.category = pick(cats); // thiếu category ~20%
    products.push(p); // sku có thể trùng
  }
  const nSku = nProducts + 3; // vài sku không có trong products
  const nCust = pick([1, 2, 5, 50]);
  const missingCust = pick([0, 0, 0.1, 0.5]);
  const years = pick([[2025], [2024, 2025], [2023, 2024, 2025, 2026]]);
  const tzs = ['Z', '+07:00', '-05:00', '+00:00', '+14:00', '-11:00'];
  const statuses = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'pending', 'other'];
  const size = pick([0, 1, 1, 2, 5, 50, 300, 1000, 2000]);
  const nIds = Math.max(1, Math.floor(size / 2));

  const orders = [];
  for (let i = 0; i < size; i++) {
    const o = {
      id: 'o' + int(nIds),
      sku: 'S' + int(nSku),
      qty: pick([0, 1, 1, 2, 3, 5, 10]),
      unitPrice: pick([0, 0, 100, 250, 999, 12345, -50, -1000]),
      date: `${pick(years)}-${pad(1 + int(12))}-${pad(1 + int(28))}T${pad(int(24))}:${pad(int(60))}:00${pick(tzs)}`,
      status: pick(statuses),
    };
    if (r() >= missingCust) o.customerId = 'c' + int(nCust);
    orders.push(o);
  }
  return { orders, products };
}

const optionSets = [
  undefined,
  {},
  { topN: 0 },
  { topN: 1 },
  { topN: 2 },
  { topN: 100 },
  { from: '2025-03' },
  { to: '2025-06' },
  { from: '2024-06', to: '2025-06' },
  { from: '2025-06', to: '2025-06' },
  { from: '2025-09', to: '2025-02' }, // from > to
  { from: '2030-01' },
  { to: '1999-01' },
  { topN: 4, from: '2023-01', to: '2026-12' },
  { topN: undefined, from: undefined, to: undefined },
  { from: '', to: '' },
];

function run(fn, orders, products, opt) {
  try {
    return { ok: true, value: opt === undefined ? fn(orders, products) : fn(orders, products, opt) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

function compare(orders, products, opt, label) {
  const snap = JSON.stringify([orders, products]);
  const a = run(buildReport, orders, products, opt);
  const snapAfterNew = JSON.stringify([orders, products]);
  const b = run(legacy.buildReport, orders, products, opt);
  assert.equal(snapAfterNew, snap, `${label}: bản mới sửa đầu vào`);
  assert.deepStrictEqual(a, b, `${label}: khác bản cũ (opt=${JSON.stringify(opt)})`);
}

test('fuzz: dữ liệu ngẫu nhiên × nhiều options', () => {
  let count = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { orders, products } = gen(seed);
    for (const opt of optionSets) {
      compare(orders, products, opt, `seed ${seed}`);
      count++;
    }
  }
  assert.ok(count >= 900);
  console.log(`# fuzz: đã so sánh ${count} cặp (dữ liệu × options)`);
});

test('fuzz: danh sách rỗng và 1 dòng', () => {
  const one = { id: 'x', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-05-05T00:00:00Z', status: 'paid' };
  const prods = [{ sku: 'A', name: 'n', category: 'k' }];
  for (const opt of optionSets) {
    compare([], [], opt, 'rỗng');
    compare([], prods, opt, 'rỗng+sp');
    compare([one], [], opt, '1 dòng');
    compare([one], prods, opt, '1 dòng+sp');
    for (const status of ['refunded', 'cancelled', 'pending']) compare([{ ...one, status }], prods, opt, status);
    const { customerId, ...noCust } = one;
    compare([noCust], prods, opt, 'thiếu customerId');
  }
});

test('fuzz: ca ném lỗi (ngày sai) cùng loại và message', () => {
  const prods = [{ sku: 'A', name: 'n', category: 'k' }];
  const base = { id: 'x', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-05-05T00:00:00Z', status: 'paid' };
  for (const date of ['không phải ngày', '', undefined, null, '2025-13-45']) {
    for (const status of ['paid', 'cancelled']) {
      for (const opt of optionSets) {
        compare([base, { ...base, date, status }], prods, opt, `ngày ${String(date)}`);
      }
    }
  }
});

test('fuzz: dữ liệu bất thường (NaN, Infinity, -0, thiếu trường)', () => {
  const prods = [{ sku: 'A', name: 'n', category: 'k' }, { sku: 'A', name: 'dup', category: 'j' }, { sku: 'B', name: 'm' }];
  const base = { id: 'x', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2025-05-05T00:00:00Z', status: 'paid' };
  const variants = [
    { unitPrice: NaN }, { unitPrice: Infinity }, { unitPrice: -Infinity }, { unitPrice: -0 }, { qty: -0 },
    { qty: 0, unitPrice: -5 }, { id: undefined }, { id: 1 }, { customerId: null }, { customerId: 7 },
    { sku: 'B' }, { sku: 'NOPE' }, { sku: undefined }, { status: undefined },
  ];
  for (const v of variants) {
    for (const opt of [undefined, { topN: 1 }, { from: '2025-01', to: '2025-12' }]) {
      compare([base, { ...base, ...v }, { ...base, id: 'y', status: 'refunded' }], prods, opt, JSON.stringify(v));
    }
  }
});
