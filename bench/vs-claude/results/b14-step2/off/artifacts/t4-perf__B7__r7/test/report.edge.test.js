'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { generate } = require('../src/gen');
const legacy = require('./report.legacy');

const same = (orders, products, opts, label) => {
  let expected, actual, e1, e2;
  try { expected = legacy.buildReport(orders, products, opts); } catch (e) { e1 = e; }
  try { actual = buildReport(orders, products, opts); } catch (e) { e2 = e; }
  if (e1 || e2) {
    assert.equal(e2 && e2.constructor, e1 && e1.constructor, `lỗi khác nhau: ${label}`);
    return;
  }
  assert.deepStrictEqual(actual, expected, label);
};
const mk = (id, c, sku, qty, p, date, status = 'paid') => ({ id, customerId: c, sku, qty, unitPrice: p, date, status });
const prods = [
  { sku: 'A', name: 'a', category: 'Trà' },
  { sku: 'B', name: 'b', category: 'trà' },
  { sku: 'C', name: 'c', category: 'TRÀ' },
  { sku: 'D', name: 'd', category: 'Trà' },
];
const OPTS = [{}, { topN: 100 }, { topN: -1 }, { topN: 1.5 }, { topN: 2.9 }, { topN: 0.5 }, { topN: -0.5 }, { topN: '2' }, { topN: NaN },
  { from: '2025-02', to: '2025-02' }, { from: '2025-02' }, { to: '2025-02' }, { from: '2025-03', to: '2025-01' }, { from: '', to: '' }];

test('from/to chạm biên tháng (UTC)', () => {
  const orders = [
    mk('1', 'c1', 'A', 1, 100, '2025-01-31T23:59:59.999Z'),
    mk('2', 'c1', 'A', 1, 100, '2025-02-01T00:00:00.000Z'),
    mk('3', 'c2', 'B', 1, 100, '2025-02-28T23:59:59.999Z'),
    mk('4', 'c2', 'B', 1, 100, '2025-03-01T00:00:00Z'),
    mk('5', 'c3', 'C', 1, 100, '2025-02-01T00:00:00+07:00'),
    mk('6', 'c3', 'C', 1, 100, '2025-02-28T23:00:00-05:00'),
  ];
  for (const o of OPTS) same(orders, prods, o, JSON.stringify(o));
});

test('tổng bằng nhau: thứ tự sort hòa', () => {
  const orders = [];
  for (const c of ['c9', 'c1', 'c5', 'c3', 'c7', 'c2', 'c8']) {
    for (const s of ['D', 'B', 'A', 'C']) orders.push(mk('o' + c + s, c, s, 2, 100, '2025-01-10T00:00:00Z'));
  }
  orders.push(mk('x', 'c4', 'A', 8, 100, '2025-01-10T00:00:00Z'), mk('y', 'c4', 'ZZ', 8, 100, '2025-01-10T00:00:00Z'));
  for (const o of OPTS) same(orders, prods, o, JSON.stringify(o));
  // cùng revenue khác qty
  const o2 = [mk('1', 'a', 'A', 2, 300, '2025-01-01T00:00:00Z'), mk('2', 'b', 'B', 3, 200, '2025-01-01T00:00:00Z'), mk('3', 'c', 'D', 6, 100, '2025-01-01T00:00:00Z')];
  for (const o of OPTS) same(o2, prods, o, JSON.stringify(o));
});

test('amount thập phân: thứ tự cộng số thực', () => {
  const orders = [];
  const vals = [0.1, 0.2, 0.3, 1e16, -1e16, 0.7, 1 / 3, 2.675, 1e-7];
  vals.forEach((v, i) => {
    orders.push(mk('o' + i, i % 2 ? 'c1' : 'c2', 'ABCD'[i % 4], 1 + (i % 3) * 0.5, v, `2025-0${1 + (i % 3)}-05T00:00:00Z`, i % 4 === 3 ? 'refunded' : 'paid'));
  });
  for (let i = 0; i < 200; i++) orders.push(mk('r' + i, 'c' + (i % 3), 'ABCD'[i % 4], 1.1, 0.1 * (i % 7) + 0.01, `2025-0${1 + (i % 4)}-05T00:00:00Z`, i % 5 ? 'paid' : 'refunded'));
  for (const o of OPTS) same(orders, prods, o, JSON.stringify(o));
});

test('dòng có trường thiếu / giá trị lạ', () => {
  const base = mk('1', 'c1', 'A', 2, 100, '2025-01-10T00:00:00Z');
  const variants = [
    { ...base, qty: undefined }, { ...base, unitPrice: undefined }, { ...base, customerId: undefined },
    { ...base, sku: undefined }, { ...base, status: undefined }, { ...base, id: undefined },
    { ...base, qty: Infinity }, { ...base, unitPrice: NaN }, { ...base, qty: null }, { ...base, qty: '3', unitPrice: '10' },
  ];
  variants.forEach((v, i) => {
    same([v], prods, {}, 'đơn lẻ ' + i);
    same([base, v, mk('2', 'c2', 'B', 1, 50, '2025-02-01T00:00:00Z')], prods, { topN: 2 }, 'trộn ' + i);
    same([base, { ...v, status: 'refunded' }], prods, {}, 'refunded ' + i);
  });
  assert.throws(() => buildReport([{ ...base, date: undefined }], prods));
  assert.throws(() => legacy.buildReport([{ ...base, date: undefined }], prods));
});

test('1 dòng và 1 khách hàng', () => {
  for (const st of ['paid', 'refunded', 'cancelled', 'x']) {
    for (const o of OPTS) same([mk('1', 'c', 'A', 3, 100, '2025-05-05T00:00:00Z', st)], prods, o, st);
  }
  const orders = [];
  for (let i = 0; i < 50; i++) orders.push(mk('o' + (i % 7), 'only', 'ABCD'[i % 4], 1 + (i % 5), 100 + i, `2025-0${1 + (i % 6)}-05T00:00:00Z`, ['paid', 'refunded', 'cancelled'][i % 3]));
  for (const o of OPTS) same(orders, prods, o, JSON.stringify(o));
});

test('fuzz nhiều seed × tùy chọn', () => {
  for (let seed = 101; seed <= 130; seed++) {
    const d = generate({ orders: 100 + seed * 3, products: 3 + (seed % 9), customers: 1 + (seed % 7), seed });
    // làm nhiễu: category trùng hoa/thường, giá thập phân, sku trùng
    d.products.forEach((p, i) => { if (i % 3 === 0) p.category = p.category.toUpperCase(); });
    d.orders.forEach((r, i) => { if (i % 4 === 0) r.unitPrice = r.unitPrice / 7; if (i % 9 === 0) r.qty = r.qty * 0.3; });
    d.products.push({ ...d.products[0], name: 'dup', category: 'Khác' });
    for (const o of OPTS) same(d.orders, d.products, o, `seed ${seed} ${JSON.stringify(o)}`);
  }
});
