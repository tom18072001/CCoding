'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy.js');
const { generate } = require('../src/gen');

function same(orders, products, options) {
  const before = JSON.stringify(orders);
  const a = legacy.buildReport(orders, products, options);
  const b = buildReport(orders, products, options);
  assert.deepStrictEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a)); // cùng thứ tự khóa
  assert.equal(JSON.stringify(orders), before); // không sửa đầu vào
}

test('giống bản cũ trên nhiều bộ dữ liệu sinh', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 5 + seed * 7, customers: 20 + seed * 9, seed });
    same(d.orders, d.products, {});
    same(d.orders, d.products, { topN: 1 + (seed % 6) });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-06' });
    same(d.orders, d.products, { to: '2025-02', topN: 10 });
    same(d.orders, d.products, { from: '2026-01' });
  }
});

test('trường hợp biên', () => {
  same([], []);
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status, extra: 1 });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:59:59-05:00', 'refunded'), // -0
    mk('1', 'c', 'B', 2, 0, '2025-02-01T00:00:00Z', 'refunded'),
    mk('2', 'd', 'B', 3, 100, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('3', 'd', 'ZZ', 1, 100, '2025-02-10T00:00:00Z', 'paid'),
    mk('3', 'c', 'ZZ', 1, 100, '2025-02-10T00:00:00Z', 'paid'),
    mk('4', 'e', 'B', 1, 100, '2025-03-10T00:00:00Z', 'cancelled'),
    mk('5', 'e', 'A', 5, 100, '2025-03-10T00:00:00Z', 'weird'),
    mk('6', 'f', 'B', 1, 100, '2024-12-10T00:00:00Z', 'paid'),
    mk('7', 'f', 'A', -2, 100, '2025-04-10T00:00:00Z', 'paid'),
  ];
  for (const o of [{}, { topN: 0 }, { topN: 1 }, { from: '2025-02', to: '2025-03' }, { from: '2030-01' }]) same(orders, products, o);
  same(orders, [], {});
  same([mk('1', 'c', 'A', 1, 100, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'A', 1, 100, '2025-01-02T00:00:00Z', 'refunded')], products, {});
});

test('ngày không hợp lệ ném lỗi như bản cũ', () => {
  const bad = [{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'khong-phai-ngay', status: 'cancelled' }];
  assert.throws(() => legacy.buildReport(bad, []), RangeError);
  assert.throws(() => buildReport(bad, []), RangeError);
});
