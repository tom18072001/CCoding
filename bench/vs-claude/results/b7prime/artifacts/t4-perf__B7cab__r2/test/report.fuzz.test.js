'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

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

const NUMS = [0, 1, 2, 3, 5, 10, 100, 1000, -1, -3, -500, 0.5, 1.25, 0.1, 0.2, 1e9, NaN, Infinity, -Infinity, null];
const SKUS = ['A', 'B', 'C', 'D', 'a', 'NOPE', 'ZZ', '', '10', NaN, null, undefined];
const CATS = ['Đồ uống', 'Văn phòng phẩm', 'Khác', 'a', 'B', '', 'unknown'];
const CUSTS = ['c1', 'c2', 'c3', 'c10', 'c2 ', 1, 2, null, 'C1'];
const IDS = ['o1', 'o2', 'o3', 'o4', 'o5', 1, 2, null];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'refunded', 'cancelled'];
const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00Z',
  '2025-02-01T03:00:00+07:00', '2025-01-31T20:00:00-05:00', '2025-03-15T12:00:00Z', '2025-06-30T23:59:59Z',
  '2025-07-01T00:00:00Z', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z', '2023-05-05T05:05:05Z',
];
const OPTS = [
  undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 1000 }, { topN: undefined }, { topN: null },
  { from: '2025-01' }, { to: '2025-02' }, { from: '2025-01', to: '2025-01' }, { from: '2025-02', to: '2025-06', topN: 1 },
  { from: '2025-07', to: '2025-01' }, { from: '2024-12', to: '2026-01', topN: 5 }, { from: '', to: '' }, { from: undefined, to: '2025-03' },
];

function genCase(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const np = Math.floor(rand() * 8);
  const products = [];
  for (let i = 0; i < np; i++) products.push({ sku: pick(SKUS), name: pick(['Trà', 'Bút', 'N', '', null]), category: pick(CATS) });
  const n = Math.floor(rand() * 51);
  const orders = [];
  for (let i = 0; i < n; i++) {
    const o = {
      id: pick(IDS), customerId: pick(CUSTS), sku: pick(SKUS),
      qty: pick(NUMS), unitPrice: pick(NUMS), date: pick(DATES), status: pick(STATUSES),
    };
    if (rand() < 0.05) delete o.customerId;
    if (rand() < 0.05) o.extra = { x: 1 };
    orders.push(o);
  }
  return { orders, products, options: pick(OPTS) };
}

test('fuzz: 400 ca ngẫu nhiên (seed cố định) giống hệt bản cũ', () => {
  const rand = rng(20261103);
  for (let i = 0; i < 400; i++) {
    const { orders, products, options } = genCase(rand);
    const args = options === undefined ? [orders, products] : [orders, products, options];
    const expected = legacy(...args);
    const actual = buildReport(...args);
    assert.deepStrictEqual(actual, expected, `ca #${i}: ${JSON.stringify({ orders, products, options })}`);
  }
});

test('fuzz: số nguyên bình thường, nhiều tháng/năm, sku trùng, mọi options', () => {
  const rand = rng(777);
  for (let i = 0; i < 50; i++) {
    const products = [];
    for (let k = 0; k < 6; k++) products.push({ sku: 'S' + k, name: 'P' + k, category: 'C' + (k % 3) });
    products.push({ sku: 'S1', name: 'dup', category: 'C9' });
    const orders = [];
    for (let k = 0; k < 50; k++) {
      orders.push({
        id: 'o' + Math.floor(rand() * 10), customerId: 'c' + Math.floor(rand() * 8), sku: 'S' + Math.floor(rand() * 8),
        qty: Math.floor(rand() * 7) - 1, unitPrice: Math.floor(rand() * 5) * 250,
        date: new Date(Date.UTC(2023 + Math.floor(rand() * 3), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))).toISOString(),
        status: ['paid', 'refunded', 'cancelled'][Math.floor(rand() * 3)],
      });
    }
    for (const options of OPTS) {
      assert.deepStrictEqual(buildReport(orders, products, options), legacy(orders, products, options), `vòng ${i} options ${JSON.stringify(options)}`);
    }
  }
});

test('mảng rỗng và options thiếu', () => {
  const prods = [{ sku: 'A', name: 'n', category: 'c' }];
  for (const options of OPTS) {
    assert.deepStrictEqual(buildReport([], [], options), legacy([], [], options));
    assert.deepStrictEqual(buildReport([], prods, options), legacy([], prods, options));
  }
});

test('không sửa đầu vào', () => {
  const rand = rng(99);
  for (let i = 0; i < 30; i++) {
    const { orders, products, options } = genCase(rand);
    const clone = structuredClone({ orders, products, options });
    buildReport(orders, products, options);
    assert.deepStrictEqual(orders, clone.orders);
    assert.deepStrictEqual(products, clone.products);
    assert.deepStrictEqual(options, clone.options);
  }
});
