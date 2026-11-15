'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const oracle = require('./oracle').buildReport;
const { generate } = require('./_gen');
const { hash } = require('./_canon');

function same(orders, products, options) {
  const exp = oracle(orders, products, options);
  const act = buildReport(orders, products, options);
  assert.deepStrictEqual(act, exp);
}

for (const [name, cfg, options] of [
  ['seed 1, mặc định', { orders: 3000, products: 120, customers: 200, seed: 1 }, undefined],
  ['seed 2, topN 5', { orders: 3000, products: 60, customers: 50, seed: 2 }, { topN: 5 }],
  ['seed 3, topN 1', { orders: 2000, products: 300, customers: 400, seed: 3 }, { topN: 1 }],
  ['seed 4, from/to', { orders: 3000, products: 100, customers: 100, seed: 4 }, { from: '2025-03', to: '2025-06' }],
  ['seed 5, chỉ from', { orders: 2500, products: 100, customers: 100, seed: 5 }, { from: '2025-11' }],
  ['seed 6, chỉ to (gồm tháng 2024-12 do múi giờ)', { orders: 2500, products: 100, customers: 100, seed: 6 }, { to: '2025-01' }],
  ['seed 7, ít khách (nhiều dòng trùng đơn)', { orders: 3000, products: 30, customers: 5, seed: 7 }, { topN: 10 }],
  ['seed 8, topN 0', { orders: 1000, products: 50, customers: 50, seed: 8 }, { topN: 0 }],
]) {
  test(`tương đương bản cũ: ${name}`, () => {
    const d = generate(cfg);
    same(d.orders, d.products, options);
  });
}

test('tương đương: danh sách rỗng', () => {
  same([], [], {});
  same([], [{ sku: 'A', name: 'a', category: 'x' }], { topN: 2 });
});

test('tương đương: toàn bộ đơn bị hủy', () => {
  const d = generate({ orders: 500, products: 20, customers: 20, seed: 9 });
  same(d.orders.map((o) => ({ ...o, status: 'cancelled' })), d.products);
});

test('tương đương: hoàn tiền lớn hơn doanh thu (tổng âm, sản phẩm doanh thu ≤ 0 bị loại)', () => {
  const d = generate({ orders: 1500, products: 40, customers: 40, seed: 10 });
  same(d.orders.map((o, i) => (i % 3 === 0 ? o : { ...o, status: o.status === 'paid' ? 'refunded' : o.status })), d.products, { topN: 4 });
});

test('tương đương: SKU trùng trong danh mục sản phẩm (lấy bản đầu tiên)', () => {
  const d = generate({ orders: 2000, products: 50, customers: 60, seed: 11 });
  const dup = d.products.slice(0, 10).map((p) => ({ ...p, name: p.name + ' (bản sao)', category: 'Bản sao' }));
  same(d.orders, [...d.products, ...dup], { topN: 3 });
});

test('tương đương: ngày sát ranh giới tháng theo múi giờ', () => {
  const products = [{ sku: 'A', name: 'A', category: 'X' }, { sku: 'B', name: 'B', category: 'Y' }];
  const orders = [
    { id: 'o1', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-04-01T05:00:00+07:00', status: 'paid' },
    { id: 'o2', customerId: 'c2', sku: 'B', qty: 2, unitPrice: 700, date: '2025-04-01T07:00:00+07:00', status: 'paid' },
    { id: 'o3', customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-03-31T23:59:59Z', status: 'refunded' },
    { id: 'o4', customerId: 'c3', sku: 'B', qty: 1, unitPrice: 500, date: '2025-05-01T00:30:00+01:00', status: 'paid' },
    { id: 'o4', customerId: 'c3', sku: 'A', qty: 3, unitPrice: 500, date: '2025-05-01T00:30:00+01:00', status: 'paid' },
    { id: 'o5', customerId: 'c2', sku: 'B', qty: 1, unitPrice: 500, date: '2025-06-15T12:00:00Z', status: 'cancelled' },
  ];
  same(orders, products);
  same(orders, products, { from: '2025-04' });
  same(orders, products, { to: '2025-03', topN: 1 });
  assert.deepEqual(buildReport(orders, products).months, ['2025-03', '2025-04']);
});

test('không sửa dữ liệu đầu vào', () => {
  const d = generate({ orders: 3000, products: 100, customers: 100, seed: 12 });
  const before = hash(d);
  buildReport(d.orders, d.products, { topN: 3 });
  assert.equal(hash(d), before);
});

test('gọi nhiều lần cho cùng kết quả (không giữ trạng thái giữa các lần gọi)', () => {
  const a = generate({ orders: 2000, products: 80, customers: 80, seed: 13 });
  const b = generate({ orders: 2000, products: 80, customers: 80, seed: 14 });
  const ra = oracle(a.orders, a.products);
  buildReport(b.orders, b.products);
  assert.deepStrictEqual(buildReport(a.orders, a.products), ra);
});

const big = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
function timed(fn) {
  const t0 = process.hrtime.bigint();
  const r = fn();
  return [r, Number(process.hrtime.bigint() - t0) / 1e6];
}

test('200k dòng: kết quả giống hệt bản cũ (băm)', () => {
  const [r] = timed(() => buildReport(big.orders, big.products, { topN: 5 }));
  assert.equal(hash(r), 'a8ba1d5ce9be7ad1b313b1c1f0bdfecdc5d0c2aed3628001ee3e2c460694d6f8');
  const r2 = buildReport(big.orders, big.products, { topN: 2, from: '2025-03', to: '2025-09' });
  assert.equal(hash(r2), '4843b197faf8e8091f1c8548e49618495c940b001a465e15ad568074c1523706');
});

for (const limit of [3000, 1500, 1000]) {
  test(`200k dòng: dưới ${limit} ms (tốt nhất trong 3 lần)`, () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) best = Math.min(best, timed(() => buildReport(big.orders, big.products, { topN: 5 }))[1]);
    console.log(`# thời gian tốt nhất: ${best.toFixed(0)} ms`);
    assert.ok(best < limit, `${best.toFixed(0)} ms ≥ ${limit} ms`);
  });
}
