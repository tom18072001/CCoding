'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: ref } = require('./reference-report');
const { generate, rng } = require('../src/gen');

function same(orders, products, options) {
  const snap = JSON.stringify(orders);
  const a = buildReport(orders, products, options);
  assert.equal(JSON.stringify(orders), snap, 'không được sửa đầu vào');
  const b = ref(orders, products, options);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); // cả thứ tự khóa
}

test('giống bản cũ trên dữ liệu sinh', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 25, seed });
    same(d.orders, d.products, {});
    same(d.orders, d.products, { topN: 5 });
    same(d.orders, d.products, { topN: 0 });
    same(d.orders, d.products, { topN: 1, from: '2025-03', to: '2025-09' });
    same(d.orders, d.products, { from: '2025-06' });
    same(d.orders, d.products, { to: '2025-02' });
    same(d.orders, d.products, { from: '2026-01' });
  }
});

test('trường hợp biên', () => {
  same([], [], {});
  same([], [{ sku: 'A', name: 'x', category: 'c' }]);
  const products = [
    { sku: 'A', name: 'Một', category: 'X' },
    { sku: 'A', name: 'Hai', category: 'Y' }, // trùng sku: lấy cái đầu
    { sku: 'B', name: 'B', category: 'X' },
    { sku: 'C', name: 'C' }, // thiếu category
    { sku: 'D', category: 'Z' }, // thiếu name
  ];
  const mk = (id, c, sku, qty, price, date, status, extra) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status, ...extra });
  const orders = [
    mk('1', 'a', 'A', 1, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('1', 'a', 'B', 1, 100, '2025-01-31T23:30:00-05:00', 'paid'), // hòa doanh thu & qty
    mk('2', 'b', 'A', 0, 100, '2025-02-01T00:00:00Z', 'refunded'), // -0
    mk('3', 'b', 'Q', 2, 50, '2025-02-01T00:00:00+07:00', 'refunded'),
    mk('4', 'c', 'C', 2, 50, '2025-03-01T00:00:00Z', 'paid'),
    mk('5', 'c', 'D', 2, 50, '2025-03-01T00:00:00Z', 'paid', { month: 'x', amount: 5, category: 'zz' }),
    mk('6', 'd', 'A', 3, 10, '2025-03-01T00:00:00Z', 'weird'),
    mk('7', 'e', 'A', NaN, 10, '2025-04-01T00:00:00Z', 'paid'),
    mk('8', undefined, 'A', 1, 10, '2025-04-01T00:00:00Z', 'refunded'),
    mk('9', 'f', 'B', 1, 0.1, '2025-04-01T00:00:00Z', 'paid'),
    mk('9', 'f', 'B', 1, 0.2, '2025-04-01T00:00:00Z', 'paid'),
    mk('10', 'g', 'A', 1, 1, '2025-05-01', 'cancelled'),
  ];
  const optionSets = [{}, { topN: 10 }, { topN: -1 }, { topN: undefined }, { from: '2025-02', to: '2025-03' }, { from: '', to: '' }, { to: '2024-12' }];
  for (const o of optionSets) same(orders, products, o);
  // toàn hoàn tiền -> grandTotal âm; tổng 0 -> share 0
  same([mk('1', 'a', 'A', 1, 100, '2025-01-01T00:00:00Z', 'refunded')], products);
  same([mk('1', 'a', 'A', 1, 0, '2025-01-01T00:00:00Z', 'paid')], products);
});

test('ngày không hợp lệ: cùng lỗi, kể cả dòng bị huỷ', () => {
  const o = [{ id: '1', customerId: 'a', sku: 'A', qty: 1, unitPrice: 1, date: 'nope', status: 'cancelled' }];
  assert.throws(() => ref(o, []), RangeError);
  assert.throws(() => buildReport(o, []), RangeError);
});

test('ngẫu nhiên có hòa điểm', () => {
  const r = rng(99);
  const pick = (n) => Math.floor(r() * n);
  for (let t = 0; t < 30; t++) {
    const products = Array.from({ length: 6 }, (_, i) => ({ sku: `S${i}`, name: `n${i}`, category: `c${pick(3)}` }));
    const orders = Array.from({ length: 300 }, () => ({
      id: `o${pick(40)}`,
      customerId: `k${pick(12)}`,
      sku: `S${pick(8)}`,
      qty: pick(3),
      unitPrice: pick(3) * 100,
      date: `2025-0${1 + pick(4)}-1${pick(9)}T0${pick(9)}:00:00Z`,
      status: ['paid', 'refunded', 'cancelled'][pick(3)],
    }));
    same(orders, products, { topN: pick(6) });
  }
});

test('hiệu năng: 200.000 dòng < 1 giây', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = process.hrtime.bigint();
  buildReport(d.orders, d.products, { topN: 5 });
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 1000);
});
