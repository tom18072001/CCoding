'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy.js').buildReport;
const { generate } = require('../src/gen');

let n = 0;
const line = (o) => ({ id: `o${n++}`, customerId: 'c1', sku: 'S1', qty: 1, unitPrice: 100, date: '2025-05-15T12:00:00Z', status: 'paid', ...o });
const prods = [
  { sku: 'S1', name: 'Một', category: 'A' },
  { sku: 'S2', name: 'Hai', category: 'A' },
  { sku: 'S3', name: 'Ba', category: 'B' },
  { sku: 'a b/ü"é,\\\'#', name: 'Đặc biệt', category: 'C đặc/biệt' },
  { sku: '__proto__', name: 'Proto', category: 'A' },
];

function same(orders, products, opts) {
  const args = opts === 'none' ? [orders, products] : [orders, products, opts];
  assert.deepStrictEqual(buildReport(...args), legacy(...args));
}

test('mốc from/to sát biên (bằng nhau, lệch 1 ms, tháng khác nhau)', () => {
  const dates = [
    '2025-04-30T23:59:59.999Z', '2025-05-01T00:00:00.000Z', '2025-05-31T23:59:59.999Z',
    '2025-06-01T00:00:00.000Z', '2025-06-30T23:59:59.999Z', '2025-07-01T00:00:00.000Z',
    '2025-12-31T23:59:59.999Z', '2026-01-01T00:00:00.000Z', '2025-05-01T00:00:00.000+07:00', '2025-05-31T23:30:00-05:00',
  ];
  const orders = dates.map((date, i) => line({ date, qty: i + 1, customerId: `c${i % 3}`, sku: i % 2 ? 'S1' : 'S3' }));
  const optSets = [
    { from: '2025-05', to: '2025-05' }, { from: '2025-06', to: '2025-06' }, { from: '2025-05', to: '2025-06' },
    { from: '2025-07', to: '2025-05' }, { from: '2025-12', to: '2026-01' }, { from: '2025-01' }, { to: '2025-12' },
    { from: '2024-01', to: '2024-12' }, { from: '', to: '' },
  ];
  for (const o of optSets) same(orders, prods, o);
});

test('paid / refunded / cancelled lẫn nhau, hoàn tiền một phần', () => {
  const orders = [
    line({ id: 'x', status: 'paid', qty: 5, unitPrice: 1000 }),
    line({ id: 'x', status: 'refunded', qty: 2, unitPrice: 1000 }),
    line({ id: 'x', status: 'cancelled', qty: 9, unitPrice: 1000 }),
    line({ id: 'y', status: 'refunded', qty: 1, unitPrice: 50, customerId: 'c2', date: '2025-06-02T00:00:00Z' }),
    line({ id: 'z', status: 'cancelled', customerId: 'c3', date: '2025-07-02T00:00:00Z' }),
    line({ id: 'w', status: 'paid', qty: 0, customerId: 'c4' }),
    line({ id: 'v', status: 'refunded', qty: 3, unitPrice: 0, sku: 'S2' }),
  ];
  same(orders, prods, {});
  same(orders, prods, { topN: 10 });
  same(orders, prods, { from: '2025-06' });
});

test('khách lặp qua nhiều tháng, doanh thu hòa, topN > số sản phẩm', () => {
  const orders = [];
  for (let m = 1; m <= 12; m++) {
    const date = `2025-${String(m).padStart(2, '0')}-10T00:00:00Z`;
    orders.push(line({ id: 'rep' + m, customerId: 'loyal', date, sku: 'S1', qty: 2, unitPrice: 50 }));
    orders.push(line({ id: 'rep' + m, customerId: 'loyal', date, sku: 'S2', qty: 1, unitPrice: 100 })); // hòa revenue, khác qty
    orders.push(line({ id: 'h' + m, customerId: 'k' + (m % 7), date, sku: 'S3', qty: 1, unitPrice: 100 }));
    orders.push(line({ id: 'q' + m, customerId: 'k' + (m % 7), date, sku: 'S3', qty: 1, unitPrice: 100, status: 'refunded' }));
  }
  // hòa hoàn toàn cả revenue lẫn qty -> phụ thuộc sku
  orders.push(line({ sku: 'S2', qty: 2, unitPrice: 50, date: '2025-01-10T00:00:00Z' }));
  for (const topN of [0, 1, 2, 3, 5, 100]) same(orders, prods, { topN });
  same(orders, prods, 'none');
  // nhiều sku bằng nhau cùng category, nhiều khách bằng doanh thu
  const tie = [];
  for (const s of ['d', 'b', 'c', 'a', 'e']) tie.push(line({ sku: s, customerId: 'cu' + s, qty: 1, unitPrice: 10 }));
  const tp = ['d', 'b', 'c', 'a', 'e'].map((s) => ({ sku: s, name: s, category: 'T' }));
  for (const topN of [1, 3, 10]) same(tie, tp, { topN });
});

test('options bỏ trống/undefined, sku ký tự đặc biệt', () => {
  const orders = [
    line({ sku: prods[3].sku, qty: 3, unitPrice: 7 }),
    line({ sku: '__proto__', qty: 2, unitPrice: 9, customerId: '__proto__' }),
    line({ sku: 'constructor', qty: 1, unitPrice: 4, customerId: 'constructor' }),
    line({ sku: 'KHÔNG-CÓ', qty: 1, unitPrice: 4, date: '2025-08-01T00:00:00Z' }),
  ];
  same(orders, prods, undefined);
  same(orders, prods, {});
  same(orders, prods, { topN: undefined, from: undefined, to: undefined });
  same(orders, prods, { from: null, to: null });
  same(orders, prods, 'none');
});

test('số thực lẻ: thứ tự cộng dồn float', () => {
  const orders = [];
  for (let i = 0; i < 300; i++) {
    orders.push(line({ id: 'f' + i, qty: 1, unitPrice: i % 2 ? 0.1 : 0.2, customerId: 'c' + (i % 4), sku: ['S1', 'S2', 'S3'][i % 3], date: `2025-0${1 + (i % 3)}-01T00:00:00Z`, status: i % 11 === 0 ? 'refunded' : 'paid' }));
    orders.push(line({ id: 'g' + i, qty: 0.3, unitPrice: 0.7, sku: 'S1' }));
  }
  same(orders, prods, {});
  same(orders.slice().reverse(), prods, { topN: 5 });
});

for (const seed of [21, 22, 23]) {
  test(`dữ liệu lớn ~20.000 dòng seed=${seed}`, () => {
    const d = generate({ orders: 20000, products: 200, customers: 300, seed });
    for (const opts of [{}, { topN: 10, from: '2025-03', to: '2025-08' }]) same(d.orders, d.products, opts);
  });
}
