'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy.js').buildReport;
const { generate, rng } = require('../src/gen');

function variants(seed) {
  const d = generate({ orders: 3000, products: 60, customers: 40, seed });
  const r = rng(seed + 100);
  // sku trùng, qty 0, sản phẩm thiếu category
  const products = d.products.concat([{ sku: d.products[0].sku, name: 'Trùng', category: 'Khác' }, { sku: 'NOCAT', name: 'X' }]);
  const orders = d.orders.map((o) => {
    const x = { ...o };
    const k = r();
    if (k < 0.03) x.qty = 0;
    if (k > 0.97) x.sku = 'NOCAT';
    return x;
  });
  return { products, orders };
}

for (const seed of [1, 2, 3, 7, 11]) {
  for (const opts of [{}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03', to: '2025-09' }, { from: '2025-11' }, { to: '2025-02', topN: 5 }, { from: '2026-01' }]) {
    test(`giống bản cũ seed=${seed} ${JSON.stringify(opts)}`, () => {
      const { orders, products } = variants(seed);
      assert.deepStrictEqual(buildReport(orders, products, opts), legacy(orders, products, opts));
    });
  }
}

test('đầu vào rỗng và toàn đơn hủy', () => {
  assert.deepStrictEqual(buildReport([], []), legacy([], []));
  const o = [{ id: 'a', customerId: 'c', sku: 'S', qty: 1, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'cancelled' }];
  assert.deepStrictEqual(buildReport(o, []), legacy(o, []));
});

test('hoàn tiền giá 0 (-0) và múi giờ', () => {
  const o = [
    { id: 'a', customerId: 'c', sku: 'S', qty: 1, unitPrice: 0, date: '2025-01-31T23:00:00-05:00', status: 'refunded' },
    { id: 'b', customerId: 'd', sku: 'S', qty: 2, unitPrice: 7, date: '2025-02-01T01:00:00+07:00', status: 'paid' },
  ];
  const p = [{ sku: 'S', name: 'n', category: 'k' }];
  assert.deepStrictEqual(buildReport(o, p), legacy(o, p));
});
