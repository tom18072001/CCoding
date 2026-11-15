'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportLegacy } = require('./fixtures/report.legacy');
const { generate, rng } = require('../src/gen');

const same = (o, p, opt) => assert.deepStrictEqual(buildReport(o, p, opt), buildReportLegacy(o, p, opt));

test('khớp bản cũ trên dữ liệu sinh với nhiều seed và options', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 25, seed });
    for (const opt of [undefined, { topN: 0 }, { topN: 1 }, { topN: 5 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2026-01' }]) {
      same(d.orders, d.products, opt);
    }
  }
});

test('khớp bản cũ: rỗng, trùng sku, hoàn tiền giá 0, trạng thái lạ, trường thiếu', () => {
  same([], []);
  const products = [
    { sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' }, { sku: 'C', name: 'C' },
  ];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const orders = [
    mk('1', 'c1', 'A', 1, 0, '2025-01-01T00:00:00Z', 'refunded'),
    mk('1', 'c1', 'B', 2, 100, '2025-01-01T00:00:00Z', 'paid'),
    mk('2', 'c2', 'B', 2, 100, '2025-01-31T23:00:00-05:00', 'paid'),
    mk('3', 'c3', 'ZZ', 1, 50, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('4', 'c3', 'C', 1, 50, '2025-02-01T00:00:00Z', 'refunded'),
    mk('5', 'c4', 'A', undefined, 50, '2025-02-01T00:00:00Z', 'paid'),
    mk(undefined, undefined, 'A', 3, 10, '2025-03-01T00:00:00Z', 'paid'),
    mk('6', 'c5', 'A', 3, 10, '2025-03-01T00:00:00Z', 'other'),
    mk('7', 'c5', 'B', 1, 10, '2025-03-01T00:00:00Z', 'cancelled'),
  ];
  for (const opt of [undefined, { topN: 10 }, { from: '2025-02' }, { to: '2025-01' }]) same(orders, products, opt);
  // tổng bằng 0
  same([mk('1', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'refunded')], products);
});

test('khớp bản cũ: ngẫu nhiên hóa mạnh (hòa doanh thu, nhiều trùng)', () => {
  const r = rng(99);
  const pick = (n) => Math.floor(r() * n);
  const products = Array.from({ length: 6 }, (_, i) => ({ sku: `S${pick(5)}`, name: `N${i}`, category: ['a', 'b', 'c'][pick(3)] }));
  const st = ['paid', 'paid', 'refunded', 'cancelled'];
  const orders = Array.from({ length: 3000 }, () => ({
    id: `o${pick(300)}`, customerId: `c${pick(20)}`, sku: `S${pick(7)}`, qty: pick(3), unitPrice: pick(3) * 100,
    date: `2025-${String(1 + pick(4)).padStart(2, '0')}-1${pick(9)}T0${pick(9)}:00:00Z`, status: st[pick(4)],
  }));
  for (const opt of [undefined, { topN: 2 }, { from: '2025-02', to: '2025-03' }]) same(orders, products, opt);
});

test('ngày không hợp lệ vẫn ném lỗi như bản cũ', () => {
  const p = [{ sku: 'A', name: 'A', category: 'X' }];
  const o = [{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'xx', status: 'paid' }];
  assert.throws(() => buildReportLegacy(o, p), RangeError);
  assert.throws(() => buildReport(o, p), RangeError);
});
