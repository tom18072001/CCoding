'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: oldReport } = require('./fixtures/report.old');
const { generate } = require('../src/gen');

function same(orders, products, opts) {
  const a = buildReport(orders, products, opts);
  const b = oldReport(orders, products, opts);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); // cả thứ tự khóa
  assert.ok(Object.is(a.grandTotal, b.grandTotal));
}

test('giống bản cũ trên dữ liệu sinh', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 60, customers: 40, seed });
    for (const opts of [{}, { topN: 5 }, { topN: 0 }, { from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-02', topN: 1 }, { from: '2026-01' }]) same(d.orders, d.products, opts);
  }
});

test('trường hợp biên', () => {
  const P = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'A', name: 'dup', category: 'Y' }, { sku: 'B', name: 'b', category: 'unknown' }, { sku: 'Z', name: 'z', category: 'X' }];
  const mk = (id, c, sku, qty, price, date, status) => ({ id, customerId: c, sku, qty, unitPrice: price, date, status });
  const O = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:00:00-05:00', 'refunded'), // -0
    mk('1', 'c', 'Q', 2, 50, '2025-02-01T00:00:00Z', 'paid'), // sku lạ, trùng tên 'unknown'
    mk('2', 'd', 'B', 1, 50, '2025-02-01T00:00:00Z', 'paid'),
    mk('3', 'd', 'Z', 3, 10, '2025-03-01T00:00:00Z', 'refunded'),
    mk('4', 'e', 'Z', 3, 10, '2025-03-01T00:00:00Z', 'cancelled'),
    mk('5', 'e', 'Z', 1, 0.1, '2025-03-01T00:00:00Z', 'paid'),
    mk('5', 'e', 'Z', 1, 0.2, '2025-03-02T00:00:00Z', 'paid'),
    mk('6', 'f', 'Z', 1, 7, '2025-03-02T00:00:00Z', 'weird'),
    mk('7', 'f', 'Z', 1, 7, '2025-03-02T00:00:00Z', 'paid'),
  ];
  same(O, P, {});
  same(O, P, { topN: 1 });
  same([], P, {});
  same(O.filter((o) => o.status === 'cancelled'), P, {});
  same(O, [], {});
  same([mk('1', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'refunded'), mk('2', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'paid')], P, {});
  same([mk('1', 'c', 'A', NaN, 5, '2025-01-01T00:00:00Z', 'paid'), mk('2', 'c', 'A', 1, 5, '2025-01-01T00:00:00Z', 'paid')], P, {});
});

test('ngày không hợp lệ vẫn ném lỗi như bản cũ', () => {
  const o = [{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'xx', status: 'paid' }];
  assert.throws(() => oldReport(o, []), RangeError);
  assert.throws(() => buildReport(o, []), RangeError);
});

test('ngẫu nhiên nhiều bộ', () => {
  let s = 12345;
  const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = (a) => a[Math.floor(r() * a.length)];
  for (let t = 0; t < 60; t++) {
    const P = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, i) => ({ sku: 'S' + i, name: 'n' + i, category: pick(['A', 'B', 'C', 'unknown']) }));
    const O = Array.from({ length: Math.floor(r() * 80) }, () => ({
      id: 'o' + Math.floor(r() * 15), customerId: 'c' + Math.floor(r() * 6), sku: 'S' + Math.floor(r() * 10),
      qty: Math.floor(r() * 4), unitPrice: pick([0, 100, 100, 250, 7]),
      date: `2025-${String(1 + Math.floor(r() * 4)).padStart(2, '0')}-10T12:00:00Z`, status: pick(['paid', 'paid', 'refunded', 'cancelled']),
    }));
    same(O, P, { topN: Math.floor(r() * 4), ...(r() < 0.3 ? { from: '2025-02' } : {}), ...(r() < 0.3 ? { to: '2025-03' } : {}) });
  }
});
