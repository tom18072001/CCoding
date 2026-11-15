'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy');
const { generate, rng } = require('../src/gen');

function same(orders, products, options) {
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.deepStrictEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a)); // cả thứ tự khóa
}

test('so với bản cũ: dữ liệu sinh ngẫu nhiên, nhiều seed/tùy chọn', () => {
  const opts = [undefined, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 5 }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 5 + seed * 7, customers: 20 + seed * 10, seed });
    for (const o of opts) same(d.orders, d.products, o);
  }
});

test('so với bản cũ: trường hợp biên (trùng sku, hòa điểm, hoàn tiền, đầu vào rỗng)', () => {
  same([], []);
  same([], [{ sku: 'A', name: 'x', category: 'c' }]);
  const products = [
    { sku: 'A', name: 'Đầu', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C', category: 'X' },
  ];
  const r = rng(99);
  const orders = [];
  const st = ['paid', 'refunded', 'cancelled'];
  for (let i = 0; i < 600; i++) {
    orders.push({
      id: 'o' + Math.floor(r() * 80),
      customerId: 'c' + Math.floor(r() * 12),
      sku: ['A', 'B', 'C', 'Z'][Math.floor(r() * 4)],
      qty: Math.floor(r() * 3), // gồm 0
      unitPrice: [0, 100, 100, 250][Math.floor(r() * 4)],
      date: ['2024-12-31T23:30:00-05:00', '2025-01-01T00:00:00Z', '2025-01-31T20:00:00-07:00', '2025-03-05T10:00:00+07:00'][Math.floor(r() * 4)],
      status: st[Math.floor(r() * 3)],
    });
  }
  for (const o of [undefined, { topN: 2 }, { from: '2025-01' }, { to: '2025-01' }]) same(orders, products, o);
  // toàn bộ hoàn tiền -> grandTotal âm; toàn bộ hủy -> rỗng
  same(orders.map((o) => ({ ...o, status: 'refunded' })), products);
  same(orders.map((o) => ({ ...o, status: 'cancelled' })), products);
});

test('so với bản cũ: hiệu ứng JSON round-trip (qty thiếu -> NaN -> null)', () => {
  const products = [{ sku: 'A', name: 'a', category: 'c' }, { sku: 'B', name: 'b' }];
  const orders = [
    { id: 1, customerId: 'x', sku: 'A', unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' },
    { id: 2, customerId: 'x', sku: 'A', qty: 2, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' },
    { id: 3, customerId: 'y', sku: 'B', qty: 1, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'refunded' },
    { id: 4, customerId: 'y', sku: 'B', qty: 0, unitPrice: 5, date: '2025-02-01T00:00:00Z', status: 'refunded' },
  ];
  same(orders, products);
});
