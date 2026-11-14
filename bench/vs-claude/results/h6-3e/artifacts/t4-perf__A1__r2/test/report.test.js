'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { generate } = require('../src/gen');

test('báo cáo nhỏ', () => {
  const products = [{ sku: 'A', name: 'Trà', category: 'Đồ uống' }, { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' }];
  const orders = [
    { id: 'o1', customerId: 'c1', sku: 'A', qty: 2, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid' },
    { id: 'o1', customerId: 'c1', sku: 'B', qty: 1, unitPrice: 500, date: '2025-01-05T10:00:00Z', status: 'paid' },
    { id: 'o2', customerId: 'c2', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-02-01T03:00:00Z', status: 'refunded' },
    { id: 'o3', customerId: 'c2', sku: 'B', qty: 4, unitPrice: 500, date: '2025-02-02T03:00:00Z', status: 'cancelled' },
  ];
  const r = buildReport(orders, products);
  assert.deepEqual(r.months, ['2025-01', '2025-02']);
  assert.equal(r.grandTotal, 1500);
  assert.deepEqual(r.monthly[0], { month: '2025-01', revenue: 2500, refunds: 0, orders: 1, customers: 1, runningTotal: 2500 });
  assert.deepEqual(r.monthly[1], { month: '2025-02', revenue: -1000, refunds: 1000, orders: 0, customers: 0, runningTotal: 1500 });
  assert.equal(r.categories[0].category, 'Đồ uống');
  assert.deepEqual(r.topCustomers[0], { customerId: 'c1', revenue: 2500, orders: 1 });
});

test('dữ liệu sinh ngẫu nhiên chạy được', () => {
  const d = generate({ orders: 2000, seed: 3 });
  const r = buildReport(d.orders, d.products, { topN: 2 });
  assert.ok(r.categories.length > 0);
});

// So sánh với bản gốc (test/report.legacy.js) — bản gốc là đặc tả.
const legacy = require('./report.legacy');

function mutate(d, seed) {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const orders = d.orders.map((o) => {
    const x = { ...o };
    const t = r();
    if (t < 0.05) x.qty = 0;
    else if (t < 0.08) x.status = 'weird';
    else if (t < 0.1) x.sku = undefined;
    else if (t < 0.12) x.date = new Date(Date.UTC(2025, Math.floor(r() * 12), 1 + Math.floor(r() * 27)));
    else if (t < 0.14) x.unitPrice = 0;
    else if (t < 0.16) x.customerId = 7;
    else if (t < 0.18) x.qty = undefined;
    return x;
  });
  const products = d.products.map((p, i) => (i % 17 === 0 ? { sku: p.sku, name: p.name } : p)).concat(d.products.slice(0, 3));
  return { orders, products };
}

test('giống hệt bản gốc trên nhiều bộ dữ liệu và tùy chọn', () => {
  const optsList = [undefined, {}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03' }, { to: '2025-09' },
    { from: '2025-02', to: '2025-02' }, { from: '2025-09', to: '2025-02' }, { topN: 2, from: '2025-01', to: '2025-12' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 150, products: 5 + seed * 7, customers: 3 + seed * 5, seed });
    for (const data of [d, mutate(d, seed)]) {
      for (const opts of optsList) {
        const a = buildReport(data.orders, data.products, opts);
        const b = legacy.buildReport(data.orders, data.products, opts);
        assert.deepStrictEqual(a, b);
        assert.equal(JSON.stringify(a), JSON.stringify(b)); // cả thứ tự khóa
      }
    }
  }
});

test('đầu vào rỗng / tất cả bị lọc giống bản gốc', () => {
  const d = generate({ orders: 50, seed: 5 });
  for (const [o, p, opt] of [[[], [], {}], [d.orders, [], {}], [d.orders, d.products, { from: '2030-01' }],
    [d.orders.map((x) => ({ ...x, status: 'cancelled' })), d.products, {}]]) {
    assert.deepStrictEqual(buildReport(o, p, opt), legacy.buildReport(o, p, opt));
  }
});
