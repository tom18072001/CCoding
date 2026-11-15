'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportReference } = require('./report.reference');
const { generate, rng } = require('../src/gen');

function same(orders, products, options) {
  const before = JSON.stringify(orders);
  const exp = buildReportReference(orders, products, options);
  const got = buildReport(orders, products, options);
  assert.deepEqual(got, exp);
  assert.equal(JSON.stringify(got), JSON.stringify(exp)); // cùng thứ tự khóa/phần tử
  assert.equal(JSON.stringify(orders), before); // không sửa đầu vào
}

test('so với bản cũ: dữ liệu sinh, nhiều seed và options', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 60, customers: 40, seed });
    same(d.orders, d.products, undefined);
    same(d.orders, d.products, { topN: 1 });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { topN: 10, from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-11' });
    same(d.orders, d.products, { to: '2025-02' });
    same(d.orders, d.products, { from: '2030-01' }); // rỗng
  }
});

test('so với bản cũ: rỗng, sku trùng, thiếu category, giá 0, hòa điểm', () => {
  same([], [], {});
  const products = [
    { sku: 'A', name: 'A1', category: 'X' },
    { sku: 'A', name: 'A2', category: 'Y' }, // trùng sku: bản đầu thắng
    { sku: 'B', name: 'B' }, // thiếu category
    { sku: 'C', name: 'C', category: 'X' },
    { sku: 'D', name: 'D', category: 'X' },
  ];
  const r = rng(9);
  const orders = [];
  const sts = ['paid', 'refunded', 'cancelled'];
  for (let i = 0; i < 400; i++) {
    orders.push({
      id: 'o' + Math.floor(r() * 50),
      customerId: 'c' + Math.floor(r() * 6),
      sku: ['A', 'B', 'C', 'D', 'Z'][Math.floor(r() * 5)],
      qty: Math.floor(r() * 3),
      unitPrice: [0, 100, 100, 250][Math.floor(r() * 4)],
      date: ['2025-01-31T23:00:00-05:00', '2025-02-01T00:00:00+07:00', '2024-12-31T23:59:59Z', '2025-06-15T00:00:00Z'][Math.floor(r() * 4)],
      status: sts[Math.floor(r() * 3)],
    });
  }
  same(orders, products, { topN: 5 });
  same(orders, products, { topN: 2, from: '2025-01', to: '2025-02' });
  same(orders.filter((o) => o.status === 'refunded'), products, {});
});

test('ngày sai: cả hai bản cùng ném RangeError', () => {
  const bad = [{ id: 'x', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'khong-phai-ngay', status: 'paid' }];
  assert.throws(() => buildReportReference(bad, []), RangeError);
  assert.throws(() => buildReport(bad, []), RangeError);
});

// ---- Fuzz bổ sung (S1) ----
function fuzzData(seed, n) {
  const r = rng(seed);
  const pick = (k) => Math.floor(r() * k);
  const products = [];
  for (let i = 0; i < 12; i++) {
    const p = { sku: 'S' + (i % 9), name: 'N' + i }; // sku lặp (i>=9 trùng)
    if (i % 4 !== 3) p.category = 'K' + pick(4); // một số thiếu category
    products.push(p);
  }
  const dates = [
    '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00+07:00', '2025-01-31T23:59:59.999Z',
    '2025-01-31T20:00:00-05:00', '2025-02-28T23:00:00-02:00', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
    '2025-06-30T17:00:00-07:00', '2025-07-01T06:59:59+07:00', '2024-02-29T12:00:00Z',
  ];
  const prices = [0, 1, 99, 100, 333, 1999, 0.1, 0.2, 0.3, 19.99, 1e15 + 1];
  const qtys = [0, 1, 2, 3, 0.1, 0.7, 1.5, 3.3];
  const sts = ['paid', 'paid', 'refunded', 'cancelled'];
  const orders = [];
  for (let i = 0; i < n; i++) {
    orders.push({
      id: 'o' + pick(30), customerId: 'c' + pick(8), sku: 'S' + pick(11),
      qty: qtys[pick(qtys.length)], unitPrice: prices[pick(prices.length)],
      date: dates[pick(dates.length)], status: sts[pick(sts.length)],
    });
  }
  return { orders, products };
}

test('fuzz: nhiều seed, ranh giới tháng/năm, số thập phân, topN lớn, from=to', () => {
  const optList = [
    undefined, {}, { topN: 100 }, { topN: 0 }, { topN: 1 }, { from: '2025-01', to: '2025-01' },
    { from: '2025-02', to: '2025-02' }, { from: '2024-12', to: '2025-01', topN: 50 }, { from: '2025-12' },
    { to: '2024-12' }, { from: '2025-07', to: '2025-06' }, { from: '2026-01', to: '2026-01' },
  ];
  for (let seed = 1; seed <= 60; seed++) {
    const { orders, products } = fuzzData(seed, 50 + seed * 7);
    for (const o of optList) same(orders, products, o);
  }
});

test('fuzz: hòa điểm khi sắp xếp (doanh thu/số lượng/sku/khách giống nhau)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = rng(seed * 13);
    const products = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => ({ sku: s, name: s, category: i < 4 ? 'X' : 'Y' }));
    const orders = [];
    for (let i = 0; i < 80; i++) {
      orders.push({
        id: 'o' + (i % 10), customerId: 'c' + Math.floor(r() * 9), sku: products[Math.floor(r() * 7)].sku,
        qty: 1 + Math.floor(r() * 2), unitPrice: 100, date: '2025-03-10T00:00:00Z', status: r() < 0.8 ? 'paid' : 'refunded',
      });
    }
    same(orders, products, { topN: 10 });
    same(orders, products, { topN: 2 });
  }
});
