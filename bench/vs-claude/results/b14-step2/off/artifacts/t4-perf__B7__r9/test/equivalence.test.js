'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;
const { generate, rng } = require('../src/gen');

function same(orders, products, options) {
  assert.deepStrictEqual(buildReport(orders, products, options), legacy(orders, products, options));
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên, nhiều tùy chọn', () => {
  const opts = [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 5 }, { topN: 100 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-02' }, { from: '2025-09', to: '2025-03' }, { from: '2024-01', to: '2026-01', topN: 2 }];
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: seed % 2 ? 5 : 150, customers: seed % 3 ? 20 : 400, seed });
    for (const o of opts) same(d.orders, d.products, o);
  }
});

test('giống bản cũ: rỗng, sản phẩm trùng sku, trạng thái lạ, hoàn tiền, hòa điểm', () => {
  same([], [], undefined);
  same([], [{ sku: 'A', name: 'x', category: 'c' }]);
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'C', name: 'Không danh mục' },
    { sku: 'D', category: 'Z' },
  ];
  const r = rng(99);
  const statuses = ['paid', 'refunded', 'cancelled', 'pending', undefined];
  const orders = [];
  for (let i = 0; i < 2000; i++) {
    orders.push({
      id: `o${Math.floor(r() * 300)}`,
      customerId: `c${Math.floor(r() * 12)}`,
      sku: ['A', 'B', 'C', 'D', 'Z'][Math.floor(r() * 5)],
      qty: Math.floor(r() * 4),
      unitPrice: 100 * Math.floor(r() * 3),
      date: ['2025-01-31T23:59:59Z', '2025-02-01T00:00:00+07:00', '2025-12-31T23:00:00-05:00', '2024-06-01T00:00:00Z'][Math.floor(r() * 4)],
      status: statuses[Math.floor(r() * 5)],
    });
  }
  for (const o of [undefined, { topN: 0 }, { topN: 2 }, { from: '2025-01' }, { to: '2025-01' }]) same(orders, products, o);
});

test('giống bản cũ: tổng bằng 0, giá trị không hữu hạn, dữ liệu không bị sửa', () => {
  const products = [{ sku: 'A', name: 'a', category: 'c' }];
  same([{ id: 1, customerId: 'x', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' }, { id: 2, customerId: 'y', sku: 'A', qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' }], products);
  same([{ id: 1, customerId: 'x', sku: 'A', qty: undefined, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' }, { id: 2, customerId: 'x', sku: 'A', qty: 2, unitPrice: Infinity, date: '2025-02-01T00:00:00Z', status: 'refunded' }], products);
  const d = generate({ orders: 500, seed: 5 });
  const snap = JSON.stringify(d);
  buildReport(d.orders, d.products);
  assert.equal(JSON.stringify(d), snap);
});
