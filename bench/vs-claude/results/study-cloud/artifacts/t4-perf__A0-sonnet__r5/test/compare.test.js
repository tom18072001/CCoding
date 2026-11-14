'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: oldReport } = require('./fixtures/report.old');
const { generate } = require('../src/gen');

function same(orders, products, opts) {
  assert.deepStrictEqual(buildReport(orders, products, opts), oldReport(orders, products, opts));
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 30, seed });
    same(d.orders, d.products, {});
    same(d.orders, d.products, { topN: 5, from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { topN: 0, from: '2025-12' });
    same(d.orders, d.products, { to: '2024-01' });
  }
});

test('giống bản cũ với các trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'a1', category: 'X' },
    { sku: 'A', name: 'a2', category: 'Y' }, // trùng sku: lấy cái đầu
    { sku: 'B', name: 'b', category: 'X' },
    { sku: 'C', name: 'c' }, // thiếu category
    { sku: 'D', category: 'Z' }, // thiếu name
  ];
  const d = (o) => ({ id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-01T00:00:00Z', status: 'paid', ...o });
  const orders = [
    d({}), d({ qty: undefined }), d({ unitPrice: NaN, status: 'refunded' }), d({ sku: 'B', qty: 3, status: 'refunded' }),
    d({ sku: 'C', id: 'p' }), d({ sku: 'D', customerId: undefined }), d({ sku: 'zz', date: '2025-01-31T23:30:00-05:00' }),
    d({ sku: 'B', unitPrice: 0.1, qty: 3 }), d({ sku: 'B', unitPrice: 0.2, qty: 3, id: 'q' }), d({ unitPrice: -50 }),
    d({ unitPrice: Infinity, sku: 'B' }), d({ status: 'cancelled' }), d({ sku: 'B', date: '2025-03-01T00:00:00Z', id: undefined }),
    d({ sku: undefined }), d({ sku: NaN }), d({ qty: 0, unitPrice: 0, sku: 'B' }),
  ];
  same(orders, products, {});
  same(orders, products, { topN: 1, from: '2025-02' });
  same([], products, {});
  same([d({ status: 'refunded' })], products, {});
  same([d({ qty: 0 })], products, {});
});

test('lỗi ngày không hợp lệ giống bản cũ', () => {
  const o = [{ id: 1, customerId: 1, sku: 'A', qty: 1, unitPrice: 1, date: 'bad', status: 'paid' }];
  assert.throws(() => oldReport(o, []), RangeError);
  assert.throws(() => buildReport(o, []), RangeError);
});
