'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản cũ (test/report.legacy.js — đặc tả).
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

// PRNG mulberry32, seed cố định
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

const BOUNDARY_DATES = [
  '2024-12-31T23:59:59.999Z', '2025-01-01T00:00:00.000Z', '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z',
  '2025-01-01T00:00:00+07:00', '2024-12-31T20:00:00-05:00', '2025-03-01T06:30:00+07:00', '2025-06-30T23:59:59.999Z',
  '2025-07-01T00:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z', '2025-02-28T23:30:00-02:00', '2024-02-29T12:00:00Z',
];
const SPECIAL_NUMS = [NaN, -0, 0, Infinity, -Infinity, null];

function genData(seed, o = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const nOrders = o.orders ?? 500;
  const nSku = o.skus ?? 12;
  const nCust = o.custs ?? 15;
  const nIds = o.ids ?? Math.max(1, Math.floor(nOrders / 2));
  const cats = o.cats ?? ['Đồ uống', 'Bánh', 'Văn phòng phẩm', 'a', 'B', 'Z'];
  const products = [];
  for (let i = 0; i < nSku; i++) {
    products.push({ sku: 'S' + i, name: 'P' + i, category: pick(cats) });
    if (o.dupSku && r() < 0.4) products.push({ sku: 'S' + i, name: 'DUP' + i, category: pick(cats) });
  }
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    let date;
    const x = r();
    if (x < 0.4) date = pick(BOUNDARY_DATES);
    else {
      const t = Date.UTC(2024, 10, 1) + Math.floor(r() * 500 * 86400000);
      date = r() < 0.5 ? new Date(t).toISOString() : new Date(t).toISOString().replace('Z', '+07:00');
    }
    const st = r();
    const status = st < (o.refundRate ?? 0.25) ? 'refunded' : st < 0.4 ? 'cancelled' : 'paid';
    let qty = o.tie ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 9);
    let unitPrice = o.tie ? 100 * (1 + Math.floor(r() * 2)) : Math.floor(r() * 100000);
    if (o.fractional && r() < 0.5) unitPrice = Math.round(r() * 1e6) / 7;
    if (o.negative && r() < 0.15) unitPrice = -unitPrice;
    if (o.negative && r() < 0.05) qty = -qty;
    if (o.special && r() < 0.08) qty = pick(SPECIAL_NUMS.filter((v) => v !== null));
    if (o.special && r() < 0.08) unitPrice = pick(SPECIAL_NUMS.filter((v) => v !== null));
    orders.push({
      id: 'o' + Math.floor(r() * nIds),
      customerId: o.tieCust ? 'c' + Math.floor(r() * 3) : 'c' + Math.floor(r() * nCust),
      sku: r() < 0.08 ? 'MISSING' + Math.floor(r() * 2) : 'S' + Math.floor(r() * nSku),
      qty, unitPrice, date, status,
    });
  }
  return { orders, products };
}

function same(orders, products, options, label) {
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.strictEqual(JSON.stringify(b), JSON.stringify(a), `JSON lệch: ${label}`);
  assert.deepStrictEqual(b, a, `deepStrictEqual lệch: ${label}`);
}

const OPTION_SETS = [
  {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 10 }, { topN: 100 },
  { from: '2025-01' }, { to: '2025-01' }, { from: '2025-01', to: '2025-01' },
  { from: '2025-01', to: '2025-06', topN: 2 }, { from: '2024-12', to: '2025-02', topN: 1 },
  { from: '2026-01' }, { to: '2000-01' }, { from: '2025-06', to: '2025-01' },
  { topN: undefined, from: undefined, to: undefined }, { from: '', to: '' }, { topN: null },
];

const PROFILES = {
  mặc_định: {},
  hòa_điểm_nhiều: { tie: true, tieCust: true, skus: 8 },
  sku_trùng: { dupSku: true },
  số_lẻ_và_âm: { fractional: true, negative: true },
  hoàn_tiền_nhiều: { refundRate: 0.7 },
  đặc_biệt_NaN_Inf_0: { special: true },
  tất_cả: { tie: true, fractional: true, negative: true, special: true, dupSku: true, refundRate: 0.4 },
  ít_danh_mục: { cats: ['x'], skus: 3, custs: 2 },
  nhiều_khách: { custs: 400, orders: 1500 },
};

for (const [name, prof] of Object.entries(PROFILES)) {
  test(`fuzz: ${name}`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { orders, products } = genData(seed * 101 + name.length, prof);
      OPTION_SETS.forEach((opt, i) => same(orders, products, opt, `${name} seed=${seed} opt#${i} ${JSON.stringify(opt)}`));
    }
  });
}

test('fuzz: vài nghìn dòng', () => {
  for (const prof of [{}, { tie: true, tieCust: true }, { special: true, fractional: true, negative: true }]) {
    const { orders, products } = genData(777, { ...prof, orders: 4000, skus: 30, custs: 60 });
    for (const opt of [{}, { topN: 5 }, { from: '2025-02', to: '2025-09', topN: 1 }]) same(orders, products, opt, JSON.stringify([prof, opt]));
  }
});

test('biên: mảng rỗng và một dòng', () => {
  same([], [], {}, 'rỗng');
  same([], [{ sku: 'A', name: 'a', category: 'c' }], { topN: 5 }, 'đơn rỗng');
  const p = [{ sku: 'A', name: 'a', category: 'c' }];
  for (const status of ['paid', 'refunded', 'cancelled']) {
    for (const date of BOUNDARY_DATES) {
      same([{ id: 'o', customerId: 'c', sku: 'A', qty: 3, unitPrice: 7, date, status }], p, {}, `1 dòng ${status} ${date}`);
      same([{ id: 'o', customerId: 'c', sku: 'A', qty: 3, unitPrice: 7, date, status }], [], { topN: 1 }, `1 dòng không sp ${status}`);
    }
  }
});

test('biên: giá trị NaN/null/-0 đơn lẻ', () => {
  const p = [{ sku: 'A', name: 'a', category: 'c' }, { sku: 'B', name: 'b', category: 'c' }];
  const vals = [NaN, null, -0, 0, Infinity, -Infinity, 1.5, -2.25];
  for (const qty of vals) {
    for (const unitPrice of vals) {
      for (const status of ['paid', 'refunded']) {
        const orders = [
          { id: 'o1', customerId: 'c1', sku: 'A', qty, unitPrice, date: '2025-01-31T23:59:59Z', status },
          { id: 'o2', customerId: 'c2', sku: 'B', qty: 2, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'paid' },
          { id: 'o3', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 5, date: '2024-12-31T23:59:59Z', status: 'paid' },
        ];
        same(orders, p, {}, `qty=${qty} price=${unitPrice} ${status}`);
        same(orders, p, { topN: 1, from: '2025-01' }, `qty=${qty} price=${unitPrice} ${status} lọc`);
      }
    }
  }
});

test('biên: ngày không hợp lệ ném lỗi giống bản cũ', () => {
  const orders = [{ id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'không phải ngày', status: 'paid' }];
  assert.throws(() => legacy.buildReport(orders, []), RangeError);
  assert.throws(() => buildReport(orders, []), RangeError);
});

test('biên: không đổi đầu vào, gọi lặp cho kết quả như nhau', () => {
  const { orders, products } = genData(5, { dupSku: true, special: true });
  const snap = JSON.stringify([orders, products]);
  const r1 = JSON.stringify(buildReport(orders, products, { topN: 2 }));
  const r2 = JSON.stringify(buildReport(orders, products, { topN: 2 }));
  assert.strictEqual(r1, r2);
  assert.strictEqual(JSON.stringify([orders, products]), snap);
});
