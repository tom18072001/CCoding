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

// So sánh với bản gốc (test/legacy-report.js) — bản gốc là đặc tả.
const legacy = require('./legacy-report');

for (const [seed, n, opts] of [
  [1, 3000, {}],
  [2, 5000, { topN: 5 }],
  [3, 5000, { topN: 0 }],
  [4, 5000, { from: '2025-03', to: '2025-09' }],
  [5, 5000, { from: '2025-06' }],
  [6, 5000, { to: '2025-02', topN: 100 }],
  [7, 5000, { from: '2030-01' }],
  [8, 50, { topN: 1 }],
]) {
  test(`giống bản gốc: seed ${seed}, ${JSON.stringify(opts)}`, () => {
    const d = generate({ orders: n, products: 60, customers: 40, seed });
    assert.deepStrictEqual(buildReport(d.orders, d.products, opts), legacy.buildReport(d.orders, d.products, opts));
  });
}

test('giống bản gốc: trường hợp biên', () => {
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'A', name: 'Trùng', category: 'Y' },
    { sku: 'B', name: 'Bút', category: 'X' },
    { sku: 'C', name: 'Không danh mục' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    mk('1', 'c', 'A', 0, 100, '2025-01-31T23:30:00-02:00', 'refunded'),
    mk('1', 'c', 'B', 2, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('2', 'd', 'C', 1, 100, '2025-02-01T00:00:00+07:00', 'paid'),
    mk('3', 'c', 'ZZ', 3, 50, '2025-03-01T00:00:00Z', 'paid'),
    mk('3', 'c', 'ZZ', 3, 50, '2025-03-01T00:00:00Z', 'refunded'),
    mk('4', 'e', 'B', 1, 100, '2025-03-01T00:00:00Z', 'cancelled'),
    mk('5', 'e', 'B', 2, 100, new Date('2025-04-01T00:00:00Z'), 'paid'),
  ];
  for (const opts of [{}, { topN: 1 }, { from: '2025-02', to: '2025-03' }]) {
    assert.deepStrictEqual(buildReport(orders, products, opts), legacy.buildReport(orders, products, opts));
  }
  assert.deepStrictEqual(buildReport([], products), legacy.buildReport([], products));
});

// ---- Đầu vào lạ: so sánh deepStrictEqual (hoặc cùng loại lỗi) với bản gốc ----
function same(orders, products, opts) {
  let a, b, ea, eb;
  try { a = buildReport(orders, products, opts); } catch (e) { ea = e; }
  try { b = legacy.buildReport(orders, products, opts); } catch (e) { eb = e; }
  if (ea || eb) {
    assert.ok(ea && eb, 'một bên ném lỗi, bên kia không');
    assert.equal(ea.constructor, eb.constructor);
    return;
  }
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(Object.keys(a), Object.keys(b));
}

test('giống bản gốc: giá trị lạ của qty/unitPrice/id/category/sku/customerId', () => {
  const vals = [undefined, null, '3', 'x', -2, 0, -0, 1.5, NaN, Infinity, {}, { a: 1 }, [1], true];
  const statuses = ['paid', 'refunded', 'cancelled', undefined, 'zzz'];
  const products = [
    { sku: 'A', name: 'Trà', category: 'X' },
    { sku: 'B', name: { n: 1 }, category: { c: 1 } },
    { sku: 'C', name: 'C', category: 5 },
    { sku: 'D', name: undefined, category: null },
    { sku: NaN, name: 'nan', category: 'N' },
    { sku: 'A', name: 'dup', category: 'Y' },
  ];
  let seed = 12345;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
  const pick = (a) => a[rnd(a.length)];
  const base = ['2025-01-05T10:00:00Z', '2025-02-05T10:00:00+05:00', '2025-02-28T23:59:59-03:00'];
  for (let iter = 0; iter < 300; iter++) {
    const orders = [];
    for (let i = 0; i < 12; i++) {
      orders.push({
        id: rnd(3) ? pick(['o1', 'o2', 7, null]) : pick(vals),
        customerId: rnd(3) ? pick(['c1', 'c2', 9]) : pick(vals),
        sku: rnd(2) ? pick(['A', 'B', 'C', 'D', 'Q']) : pick(vals),
        qty: rnd(2) ? rnd(4) : pick(vals),
        unitPrice: rnd(2) ? 100 * rnd(4) : pick(vals),
        date: pick(base),
        status: pick(statuses),
      });
    }
    same(orders, products, pick([{}, { topN: 1 }, { topN: 0 }, { topN: -1 }, { topN: 99 }, { from: '2025-02' }, { to: '2025-01' }, { topN: null }]));
  }
});

test('giống bản gốc: date lạ và múi giờ', () => {
  const mk = (date) => [{ id: 'a', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date, status: 'paid' }];
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  for (const d of ['không phải ngày', '', undefined, null, 0, 1735689600000, new Date(NaN), new Date(0), '2025-12-31T23:59:59-12:00', '2025-01-01T00:00:00+14:00', '2025-01-01']) {
    same(mk(d), products, {});
  }
});

test('giống bản gốc: topN/from/to ở biên, products rỗng, thứ tự khi bằng nhau', () => {
  const orders = [];
  for (const sku of ['z', 'a', 'm', 'b']) for (const c of ['k2', 'k1', 'k3']) {
    orders.push({ id: sku + c, customerId: c, sku, qty: 1, unitPrice: 100, date: '2025-03-01T00:00:00Z', status: 'paid' });
  }
  const products = [{ sku: 'z', name: 'z', category: 'C2' }, { sku: 'a', name: 'a', category: 'C1' }, { sku: 'm', name: 'm', category: 'C2' }];
  for (const opts of [{ topN: 0 }, { topN: -1 }, { topN: 1000 }, { topN: 1.5 }, { from: '' , to: ''}, { from: '9999-99' }, { to: '0000-00' }, { topN: '2' }]) {
    same(orders, products, opts);
    same(orders, [], opts);
  }
});
