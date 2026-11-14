'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./fixtures/report.legacy');
const { generate } = require('../src/gen');

function same(orders, products, options) {
  const a = buildReport(orders, products, options);
  const b = legacy(orders, products, options);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); // cả thứ tự khóa
}

test('so với bản cũ: dữ liệu sinh, nhiều seed/tùy chọn', () => {
  const opts = [{}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-04', to: '2025-06', topN: 2 }, { from: '2030-01' }];
  for (let seed = 1; seed <= 6; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 60, seed });
    for (const o of opts) same(d.orders, d.products, o);
  }
});

test('so với bản cũ: trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Hai', category: 'X' },
    { sku: 'C', name: 'Ba' }, // thiếu category
    { sku: 'Z', name: 'Không', category: 'X' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'c', 'A', 1, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('1', 'c', 'B', 1, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('2', 'd', 'B', 0, 100, '2025-01-01T00:00:00Z', 'refunded'),
    mk('3', 'c', 'Q', 2, 50, '2025-02-01T00:00:00+07:00', 'refunded'),
    mk('4', 'e', 'C', 1, 70, '2025-02-10T00:00:00Z', 'paid'),
    mk('5', 'e', 'Z', 1, 0, '2025-02-10T00:00:00Z', 'paid'),
    mk('6', 'f', 'B', 3, 100, '2025-03-10T00:00:00Z', 'cancelled'),
    mk('7', 'g', 'B', 1, 100, '2025-03-10T00:00:00Z', 'weird'),
  ];
  for (const o of [{}, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }]) same(orders, products, o);
  same([], products, {});
  same([mk('x', 'c', 'A', 1, 10, '2025-01-01T00:00:00Z', 'cancelled')], products, {});
  same([mk('x', 'c', 'A', 1, 10, '2025-01-01T00:00:00Z', 'refunded')], [], {});
  const bad = [mk('x', 'c', 'A', 1, 1, 'bad', 'paid')];
  assert.throws(() => buildReport(bad, products), RangeError);
  assert.throws(() => legacy(bad, products), RangeError);
});
