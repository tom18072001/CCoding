'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

// PRNG mulberry32 với seed cố định
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

// Cấu trúc khóa theo thứ tự (đệ quy) để so thứ tự khóa của object
function shape(v) {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.keys(v).map((k) => [k, shape(v[k])]);
  return v;
}

let compared = 0;
function same(orders, products, opts, label) {
  const a = buildReport(orders, products, opts);
  const b = legacy.buildReport(orders, products, opts);
  assert.deepStrictEqual(a, b, label);
  assert.deepStrictEqual(shape(a), shape(b), `${label} (thứ tự khóa)`);
  compared++;
}

const ZONES = ['Z', '+07:00', '-05:00', '+14:00', '-12:00', '+05:30'];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled', 'weird', 'PAID', ''];

function gen(r, { nOrders, nProducts, nCustomers, nMonths, decimals, weird }) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const ri = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const cats = ['Đồ uống', 'Văn phòng', 'Z', 'a', 'B', 'Đồ chơi', 'x y'];
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    products.push({ sku: 'S' + ri(0, Math.max(1, nProducts)), name: 'N' + i, category: pick(cats) }); // sku có thể trùng
  }
  const orders = [];
  for (let i = 0; i < nOrders; i++) {
    const m = ri(0, nMonths - 1);
    const year = 2024 + Math.floor(m / 12);
    const mm = String((m % 12) + 1).padStart(2, '0');
    const dd = String(ri(1, 28)).padStart(2, '0');
    const hh = String(ri(0, 23)).padStart(2, '0');
    let qty = ri(1, 9);
    if (weird) {
      const x = r();
      if (x < 0.07) qty = 0;
      else if (x < 0.15) qty = -ri(1, 5);
    }
    const unitPrice = decimals ? Math.round(r() * 100000) / 100 + 0.1 : ri(0, 50000);
    orders.push({
      id: 'o' + ri(0, Math.max(1, nOrders >> 1)),
      customerId: 'c' + ri(0, nCustomers), // trùng nhiều
      sku: weird && r() < 0.1 ? 'MISSING' + ri(0, 3) : 'S' + ri(0, Math.max(1, nProducts)),
      qty,
      unitPrice,
      date: `${year}-${mm}-${dd}T${hh}:${String(ri(0, 59)).padStart(2, '0')}:00${pick(ZONES)}`,
      status: weird ? pick(STATUSES) : pick(['paid', 'paid', 'refunded', 'cancelled']),
    });
  }
  return { orders, products };
}

const OPTS = [
  undefined,
  {},
  { topN: 0 },
  { topN: 1 },
  { topN: 2 },
  { topN: 10 },
  { topN: 1000 },
  { from: '2024-03' },
  { to: '2024-08' },
  { from: '2024-03', to: '2024-08', topN: 2 },
  { from: '2024-06', to: '2024-06' },
  { from: '2024-09', to: '2024-02' },
  { from: '2099-01' },
  { to: '1999-01' },
  { from: '', to: '' },
  { topN: undefined, from: undefined },
];

test('fuzz: dữ liệu đa dạng × nhiều tùy chọn, giống bản cũ', () => {
  const profiles = [
    { nOrders: 1, nProducts: 1, nCustomers: 1, nMonths: 1 },
    { nOrders: 50, nProducts: 5, nCustomers: 4, nMonths: 3 },
    { nOrders: 400, nProducts: 30, nCustomers: 20, nMonths: 14, weird: true },
    { nOrders: 400, nProducts: 10, nCustomers: 8, nMonths: 26, decimals: true },
    { nOrders: 600, nProducts: 60, nCustomers: 120, nMonths: 12, decimals: true, weird: true },
  ];
  for (let seed = 1; seed <= 12; seed++) {
    const r = rng(seed * 7919);
    for (const [pi, p] of profiles.entries()) {
      const { orders, products } = gen(r, p);
      for (const [oi, o] of OPTS.entries()) same(orders, products, o, `seed ${seed} profile ${pi} opts ${oi}`);
    }
  }
});

test('fuzz: tính cộng dồn số thập phân (sai số float) giống hệt bản cũ', () => {
  for (let seed = 100; seed < 106; seed++) {
    const r = rng(seed);
    const { orders, products } = gen(r, { nOrders: 3000, nProducts: 12, nCustomers: 15, nMonths: 6, decimals: true });
    // thêm qty thập phân để ép lỗi làm tròn
    for (const o of orders) if (r() < 0.3) o.qty = Math.round(r() * 1000) / 100;
    same(orders, products, undefined, `decimal seed ${seed}`);
    same(orders, products, { topN: 4, from: '2024-02', to: '2024-05' }, `decimal seed ${seed} range`);
  }
});

test('fuzz: biên — rỗng, toàn cancelled, tổng 0, tên khách trùng, products rỗng', () => {
  const r = rng(555);
  const { orders, products } = gen(r, { nOrders: 200, nProducts: 8, nCustomers: 5, nMonths: 4 });
  same([], products, undefined, 'orders rỗng');
  same([], [], { topN: 5, from: '2024-01' }, 'tất cả rỗng');
  same(orders, [], undefined, 'products rỗng');
  same(orders.map((o) => ({ ...o, status: 'cancelled' })), products, undefined, 'toàn cancelled');
  same(orders.map((o) => ({ ...o, unitPrice: 0 })), products, undefined, 'giá 0 (grandTotal 0)');
  // tổng bằng 0 do paid/refunded triệt tiêu
  const o1 = { id: 'a', customerId: 'k', sku: 'S1', qty: 2, unitPrice: 10, date: '2024-01-01T00:00:00Z', status: 'paid' };
  same([o1, { ...o1, id: 'b', status: 'refunded' }], products, undefined, 'triệt tiêu');
  // hai khách cùng doanh thu → tie-break theo customerId; sku cùng revenue/qty
  const ties = ['b', 'a', 'c', 'a'].map((c, i) => ({ id: 'i' + i, customerId: c, sku: 'S' + (i % 2), qty: 1, unitPrice: 10, date: '2024-01-01T00:00:00Z', status: 'paid' }));
  same(ties, [{ sku: 'S0', name: 'n0', category: 'C' }, { sku: 'S1', name: 'n1', category: 'C' }], { topN: 5 }, 'hòa điểm');
  // > 5 khách
  same(Array.from({ length: 9 }, (_, i) => ({ ...o1, id: 'q' + i, customerId: 'u' + (i % 7), unitPrice: 10 + (i % 3) })), products, undefined, '>5 khách');
  // ngày sai: cả hai cùng ném RangeError
  const bad = [{ ...o1, date: 'không phải ngày' }];
  assert.throws(() => buildReport(bad, products), RangeError);
  assert.throws(() => legacy.buildReport(bad, products), RangeError);
});

test('fuzz: không làm thay đổi đầu vào', () => {
  const r = rng(9);
  const { orders, products } = gen(r, { nOrders: 300, nProducts: 10, nCustomers: 10, nMonths: 5, weird: true });
  const snap = JSON.stringify([orders, products]);
  buildReport(orders, products, { topN: 2 });
  assert.equal(JSON.stringify([orders, products]), snap);
});

test.after(() => console.log(`fuzz: đã so sánh ${compared} ca`));
