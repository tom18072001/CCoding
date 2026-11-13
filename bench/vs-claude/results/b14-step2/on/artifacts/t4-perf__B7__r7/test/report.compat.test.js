'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');
const { generate, rng } = require('../src/gen');

function same(orders, products, opts) {
  const before = JSON.stringify([orders, products]);
  assert.deepStrictEqual(buildReport(orders, products, opts), legacy.buildReport(orders, products, opts));
  assert.equal(JSON.stringify([orders, products]), before, 'không sửa đầu vào');
}

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên, nhiều tùy chọn', () => {
  const optsList = [undefined, {}, { topN: 1 }, { topN: 0 }, { topN: 5 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-02' }, { from: '2025-09', to: '2025-03' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 40, customers: 25, seed });
    for (const o of optsList) same(d.orders, d.products, o);
  }
});

test('giống bản cũ với trường hợp biên (sku trùng, hoàn 0, hòa điểm, thiếu trường)', () => {
  const r = rng(99);
  const pick = (n) => Math.floor(r() * n);
  const products = [
    { sku: 'A', name: 'A1', category: 'X' }, { sku: 'A', name: 'A2', category: 'Y' },
    { sku: 'B', name: 'B', category: 'X' }, { sku: 'C', name: 'C', category: 'Z' }, { sku: 'D', name: 'D' },
  ];
  const skus = ['A', 'B', 'C', 'D', 'NOPE'];
  const statuses = ['paid', 'refunded', 'cancelled', 'paid', 'refunded', 'weird'];
  const orders = [];
  for (let i = 0; i < 600; i++) {
    orders.push({
      id: 'o' + pick(60), customerId: 'c' + pick(12), sku: skus[pick(5)], qty: pick(4), unitPrice: pick(3) * 100,
      date: `2025-0${1 + pick(4)}-1${pick(9)}T${String(pick(24)).padStart(2, '0')}:00:00${pick(2) ? 'Z' : '+07:00'}`,
      status: statuses[pick(6)],
    });
  }
  for (const o of [undefined, { topN: 2 }, { topN: 1 }, { from: '2025-02' }]) same(orders, products, o);
  same([], products);
  same([], []);
  same(orders.slice(0, 10), []);
});

test('ngày không hợp lệ: cả hai bản cùng ném RangeError', () => {
  assert.throws(() => buildReport([{ date: 'bad' }], []), RangeError);
  assert.throws(() => legacy.buildReport([{ date: 'bad' }], []), RangeError);
});
