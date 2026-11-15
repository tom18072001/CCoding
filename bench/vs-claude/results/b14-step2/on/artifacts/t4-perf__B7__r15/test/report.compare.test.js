'use strict';
// So sánh buildReport (bản tối ưu) với bản gốc giữ nguyên trong report.reference.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportReference } = require('./report.reference');
const { generate, rng } = require('../src/gen');

test('giống hệt bản gốc trên nhiều bộ dữ liệu sinh ngẫu nhiên', () => {
  const optsList = [{}, { topN: 1 }, { topN: 0 }, { topN: 5 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 4 }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 5 + seed * 7, customers: 20 + seed * 10, seed });
    for (const o of optsList) assert.deepStrictEqual(buildReport(d.orders, d.products, o), buildReportReference(d.orders, d.products, o));
  }
});

test('giống hệt bản gốc với trường hợp biên (trùng sku, hoàn tiền, hòa điểm, qty âm/0, đầu vào rỗng)', () => {
  const r = rng(99);
  const pick = (n) => Math.floor(r() * n);
  const products = [
    { sku: 'A', name: 'A1', category: 'X' },
    { sku: 'A', name: 'A2', category: 'Y' }, // trùng sku: bản gốc lấy cái đầu
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C', category: 'unknown' },
    { sku: 'D', name: 'D', category: 'Y' },
  ];
  const skus = ['A', 'B', 'C', 'D', 'Z', 'Q'];
  const statuses = ['paid', 'refunded', 'cancelled', 'paid', 'refunded', 'other'];
  const dates = ['2024-12-31T23:30:00Z', '2025-01-01T03:00:00+07:00', '2025-01-31T20:00:00-05:00', '2025-02-10T00:00:00Z', '2025-03-01T00:00:00Z'];
  const orders = [];
  for (let i = 0; i < 600; i++) {
    orders.push({
      id: `o${pick(120)}`,
      customerId: `c${pick(15)}`,
      sku: skus[pick(skus.length)],
      qty: pick(4) - (pick(10) === 0 ? 2 : 0),
      unitPrice: pick(3) * 500,
      date: dates[pick(dates.length)],
      status: statuses[pick(statuses.length)],
    });
  }
  const optsList = [{}, { topN: 1 }, { topN: 10 }, { from: '2025-01', to: '2025-02' }, { from: '2025-01', to: '2025-01' }, { to: '2024-12' }, { from: '2030-01' }];
  for (const o of optsList) assert.deepStrictEqual(buildReport(orders, products, o), buildReportReference(orders, products, o));
  assert.deepStrictEqual(buildReport([], products), buildReportReference([], products));
  assert.deepStrictEqual(buildReport(orders, []), buildReportReference(orders, []));
  const refundOnly = [{ id: 'r', customerId: 'c', sku: 'A', qty: 0, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' }];
  assert.deepStrictEqual(buildReport(refundOnly, products), buildReportReference(refundOnly, products));
});
