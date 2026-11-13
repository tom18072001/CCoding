'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');
const { generate, rng } = require('../src/gen');

const same = (d, opts) => assert.deepStrictEqual(buildReport(d.orders, d.products, opts), legacy(d.orders, d.products, opts));

test('giống bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 1500, products: 5 + seed * 7, customers: 20 + seed * 9, seed });
    same(d, undefined);
    same(d, { topN: 1 });
    same(d, { topN: 0 });
    same(d, { topN: 10, from: '2025-03', to: '2025-09' });
    same(d, { from: '2025-06' });
    same(d, { to: '2025-02' });
    same(d, { from: '2030-01' });
  }
});

test('giống bản cũ: trùng sku, hoàn tiền giá 0, hòa điểm, rỗng', () => {
  const products = [
    { sku: 'A', name: 'một', category: 'X' }, { sku: 'A', name: 'hai', category: 'Y' },
    { sku: 'B', name: 'b', category: 'X' }, { sku: 'C', name: 'c', category: 'X' },
  ];
  const r = rng(7);
  const orders = [];
  for (let i = 0; i < 400; i++) {
    orders.push({
      id: `o${Math.floor(r() * 60)}`, customerId: `c${Math.floor(r() * 9)}`,
      sku: ['A', 'B', 'C', 'Z'][Math.floor(r() * 4)], qty: Math.floor(r() * 4), unitPrice: [0, 100, 100, 250][Math.floor(r() * 4)],
      date: `2025-0${1 + Math.floor(r() * 3)}-15T23:30:00-05:00`, status: ['paid', 'refunded', 'cancelled'][Math.floor(r() * 3)],
    });
  }
  same({ orders, products }, { topN: 5 });
  same({ orders: [], products }, {});
  same({ orders, products: [] }, {});
});

// So sánh cả kết quả lẫn lỗi ném ra
const run = (fn) => { try { return { ok: fn() }; } catch (e) { return { err: e.constructor.name + ':' + e.message }; } };
const sameOrThrow = (orders, products, opts) =>
  assert.deepStrictEqual(run(() => buildReport(orders, products, opts)), run(() => legacy(orders, products, opts)));

const P = [
  { sku: 'A', name: 'a', category: 'X' }, { sku: 'B', name: 'b', category: 'Y' }, { sku: 7, name: 'bảy', category: 'Y' },
];
const row = (o = {}) => ({ id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 100, date: '2025-03-10T10:00:00Z', status: 'paid', ...o });

test('ngày không hợp lệ ném cùng lỗi (kể cả dòng cancelled, dòng bị lọc)', () => {
  for (const date of ['không phải ngày', '', undefined, null, '2025-13-45']) {
    sameOrThrow([row(), row({ date })], P);
    sameOrThrow([row({ date, status: 'cancelled' })], P);
    sameOrThrow([row({ date })], P, { from: '2030-01' });
  }
  assert.throws(() => buildReport([row({ date: 'x' })], P), RangeError);
});

test('trạng thái lạ, amount âm, sku lạ/trùng, id & customerId lẫn số/chuỗi', () => {
  const orders = [
    row({ status: 'weird' }), row({ status: undefined, id: 5 }), row({ status: 'paid', id: '5', customerId: 1 }),
    row({ status: 'paid', id: 5, customerId: '1' }), row({ qty: -3, status: 'paid' }), row({ qty: -3, status: 'refunded' }),
    row({ unitPrice: -50 }), row({ sku: 'nope' }), row({ sku: 7, id: 7 }), row({ sku: '7' }), row({ sku: undefined }),
    row({ customerId: undefined }), row({ id: undefined }),
  ];
  sameOrThrow(orders, P);
  sameOrThrow(orders, [...P, { sku: 'A', name: 'dup', category: 'Z' }], { topN: 50 });
});

// Ngoài phạm vi (đầu vào không hợp lệ, đã biết là khác bản cũ): qty là chuỗi hoặc undefined ở dòng paid/lạ
// (bản cũ nối chuỗi / ra NaN khi cộng qty; bản mới coi là 0). unitPrice chuỗi/undefined thì khớp.
test('số thực, chuỗi số, NaN/Infinity/-0, trường thiếu', () => {
  const orders = [
    row({ qty: 1.5, unitPrice: 33.3 }), row({ unitPrice: '100', status: 'refunded' }),
    row({ qty: NaN }), row({ qty: Infinity, status: 'refunded' }), row({ unitPrice: -Infinity }),
    row({ qty: -0 }), row({ qty: 0, status: 'refunded' }), row({ unitPrice: -0, status: 'refunded', sku: 'B' }),
    row({ unitPrice: undefined, sku: 'B' }), row({ qty: null }), row({ unitPrice: null, status: 'refunded' }),
    { id: 'z', qty: 1, date: '2025-04-01T00:00:00Z', status: 'paid' }, // thiếu unitPrice/sku/customerId
  ];
  sameOrThrow(orders, P);
  sameOrThrow(orders, P, { topN: 100 });
  for (const o of orders) sameOrThrow([o, row()], P);
});

test('topN lớn, from/to sát biên, nhiều múi giờ', () => {
  const tzs = ['Z', '+00:00', '+07:00', '-05:00', '+14:00', '-12:00', '+05:30'];
  const days = ['2025-01-31T23:59:59', '2025-02-01T00:00:00', '2025-02-28T23:59:59', '2025-03-01T00:00:00', '2025-12-31T23:30:00'];
  const orders = [];
  let i = 0;
  for (const tz of tzs) for (const d of days) for (const status of ['paid', 'refunded', 'cancelled'])
    orders.push(row({ id: `o${i % 5}`, customerId: `c${i % 4}`, sku: ['A', 'B', 'Q'][i % 3], qty: (i % 5) + 1, unitPrice: 10 * (i++ % 7), date: d + tz, status }));
  orders.push(row({ date: '2025-02-10T00:00:00.123+01:00' }), row({ date: 1739000000000 }), row({ date: new Date(1739000000000) }));
  for (const opts of [undefined, { topN: 1000 }, { topN: 0 }, { from: '2025-02', to: '2025-02' }, { from: '2025-01', to: '2025-02' },
    { from: '2025-03' }, { to: '2025-01' }, { from: '2025-02', to: '2025-01' }, { from: '', to: '' }, { topN: null }, { topN: undefined }, { topN: 2.5 }])
    sameOrThrow(orders, P, opts);
});
