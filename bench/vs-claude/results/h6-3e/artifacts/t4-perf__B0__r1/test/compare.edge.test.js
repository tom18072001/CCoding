'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy.js');

function same(orders, products, options, label = '') {
  const before = JSON.stringify(orders);
  const beforeP = JSON.stringify(products);
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.deepStrictEqual(b, a, label);
  assert.equal(JSON.stringify(b), JSON.stringify(a), `thứ tự khóa: ${label}`);
  assert.equal(JSON.stringify(orders), before, 'không sửa orders');
  assert.equal(JSON.stringify(products), beforeP, 'không sửa products');
}

// mulberry32 — PRNG có seed cố định
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
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-01-31T23:59:59-05:00',
  '2025-02-01T00:00:00+07:00', '2025-02-28T23:59:59Z', '2025-03-01T00:00:00Z', '2025-06-15T12:00:00+14:00',
  '2025-12-31T23:59:59-12:00', '2026-01-01T00:00:00Z', '2024-02-29T10:00:00Z', '2025-07-01T00:00:00+00:00',
];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'weird'];
const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-06', '2025-07', '2025-12', '2026-01', '2030-01', '1999-01'];

function genData(seed, n) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const nProd = 1 + Math.floor(r() * 12);
  const cats = ['A', 'B', 'C', 'Đồ chơi', 'x'];
  const products = [];
  for (let i = 0; i < nProd; i++) products.push({ sku: `S${i}`, name: `P${i}`, category: pick(cats) });
  if (r() < 0.5) products.push({ sku: 'S0', name: 'Trùng', category: pick(cats) }); // sku trùng
  const nCust = 1 + Math.floor(r() * 15);
  const orders = [];
  for (let i = 0; i < n; i++) {
    const kind = r();
    const qty = kind < 0.1 ? -Math.floor(r() * 4) : kind < 0.2 ? 0 : kind < 0.4 ? Math.round(r() * 1000) / 100 : 1 + Math.floor(r() * 5);
    const price = r() < 0.3 ? Math.round(r() * 1e5) / 1000 * 0.1 : Math.floor(r() * 50000);
    orders.push({
      id: `o${Math.floor(r() * n * 0.6)}`,
      customerId: `c${Math.floor(r() * nCust)}`,
      sku: r() < 0.15 ? `NOPE${Math.floor(r() * 3)}` : `S${Math.floor(r() * (nProd + 1))}`,
      qty,
      unitPrice: price,
      date: pick(DATES),
      status: pick(STATUSES),
    });
  }
  return { orders, products };
}

test('fuzz seed cố định (40 seed) so với bản cũ', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { orders, products } = genData(seed * 7919, 60 + (seed % 5) * 120);
    const r = rng(seed + 1000);
    const m = () => MONTHS[Math.floor(r() * MONTHS.length)];
    const optSets = [
      {}, { topN: 0 }, { topN: 1 }, { topN: 1000 }, { topN: 2, from: '2025-01', to: '2025-01' },
      { from: '2025-06', to: '2025-02' }, // đảo ngược
      { from: '2025-03', to: '2025-03' }, { from: m(), to: m(), topN: 1 + (seed % 4) }, { from: m() }, { to: m() },
      { from: '', to: '' }, { topN: undefined },
    ];
    optSets.forEach((o, i) => same(orders, products, o, `seed=${seed} opt#${i} ${JSON.stringify(o)}`));
    same(orders, [], {}, `seed=${seed} products rỗng`);
  }
});

test('số thực lẻ cộng đúng thứ tự', () => {
  const products = [{ sku: 'A', name: 'A', category: 'X' }];
  const vals = [0.1, 0.2, 0.3, 1e16, 1, -1e16, 0.7, 1e-7, 3.3];
  const orders = vals.map((v, i) => ({ id: `${i % 3}`, customerId: i % 2 ? 'p' : 'q', sku: 'A', qty: 1, unitPrice: v, date: '2025-05-05T00:00:00Z', status: i % 4 === 3 ? 'refunded' : 'paid' }));
  same(orders, products, {});
  same(orders.slice().reverse(), products, {});
  same(orders, products, { topN: 5 });
});

test('tổng bằng 0 khi chia, products rỗng/trùng, đầu vào rỗng', () => {
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const products = [{ sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'Y' }];
  // paid + refunded triệt tiêu: grandTotal = 0
  const zero = [mk('1', 'c', 'A', 2, 50, '2025-01-01T00:00:00Z', 'paid'), mk('1', 'c', 'A', 2, 50, '2025-01-02T00:00:00Z', 'refunded')];
  same(zero, products, {});
  same(zero, [], {});
  same([mk('1', 'c', 'A', 0, 50, '2025-01-01T00:00:00Z', 'paid')], products, {});
  same([mk('1', 'c', 'A', 0, 50, '2025-01-01T00:00:00Z', 'refunded')], products, {}); // -0
  same([], [], {});
  same([], products, { topN: 5, from: '2025-01', to: '2025-02' });
  same([mk('1', 'c', 'A', 1, 1, '2025-01-01T00:00:00Z', 'cancelled')], products, {}); // lọc hết
  same(zero, products, { from: '2030-01' });
  same(zero, products); // không truyền options
});

test('ngày sai ném lỗi giống bản cũ, kể cả dòng bị lọc', () => {
  const bad = (status) => [
    { id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'paid' },
    { id: '2', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'xxx', status },
  ];
  for (const st of ['paid', 'cancelled']) {
    assert.throws(() => legacy.buildReport(bad(st), [], { from: '2030-01' }), RangeError);
    assert.throws(() => buildReport(bad(st), [], { from: '2030-01' }), RangeError);
  }
});

test('dữ liệu 20.000 dòng', () => {
  const { orders, products } = genData(424242, 20000);
  same(orders, products, {}, '20k mặc định');
  same(orders, products, { topN: 10, from: '2025-01', to: '2025-12' }, '20k lọc');
});
