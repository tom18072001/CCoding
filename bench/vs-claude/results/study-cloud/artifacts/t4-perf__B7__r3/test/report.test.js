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

// So sánh với bản gốc (test/report.reference.js) — bản gốc là đặc tả.
const { buildReport: ref } = require('./report.reference');

test('giống hệt bản gốc trên nhiều bộ dữ liệu ngẫu nhiên', () => {
  const opts = [{}, { topN: 1 }, { topN: 5 }, { from: '2025-03' }, { to: '2025-09', topN: 0 }, { from: '2025-02', to: '2025-11', topN: 4 }, { from: '2026-01' }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 150, products: 5 + seed * 7, customers: 4 + seed * 9, seed });
    for (const o of opts) assert.deepStrictEqual(buildReport(d.orders, d.products, o), ref(d.orders, d.products, o));
  }
});

test('giống hệt bản gốc ở các ca biên', () => {
  const mk = (id, customerId, sku, qty, unitPrice, status, date = '2025-01-05T10:00:00Z') => ({ id, customerId, sku, qty, unitPrice, date, status });
  const cases = [
    [[], []],
    [[mk('a', 'c', 'X', 1, 100, 'cancelled')], []],
    [[mk('a', 'c', 'X', 0, 100, 'refunded'), mk('a', 'c', 'X', 2, 0, 'refunded')], [{ sku: 'X', name: 'x', category: 'K' }]],
    [[mk('a', 'c', 'X', 1, 100, 'paid'), mk('b', 'c', 'X', 1, 100, 'refunded')], [{ sku: 'X', name: 'x', category: 'K' }]],
    // sku trùng: bản đầu thắng; danh mục/tên thiếu; hòa doanh thu
    [
      [mk('a', 'c1', 'X', 1, 100, 'paid'), mk('b', 'c2', 'Y', 1, 100, 'paid'), mk('c', 'c3', 'Z', 3, 50, 'paid', '2025-02-01T00:00:00+07:00'), mk('d', 'c1', 'Q', 1, 5, 'refunded')],
      [{ sku: 'X', name: 'x1', category: 'K' }, { sku: 'X', name: 'x2', category: 'M' }, { sku: 'Y', name: 'y', category: 'K' }, { sku: 'Z', category: undefined }],
    ],
    // đơn nhiều dòng, id dùng chung giữa các khách/tháng
    [[mk('a', 'c1', 'X', 1, 100, 'paid'), mk('a', 'c1', 'X', 2, 100, 'paid'), mk('a', 'c2', 'X', 1, 100, 'paid', '2025-03-01T00:00:00Z')], [{ sku: 'X', name: 'x', category: 'K' }]],
    // số thực: thứ tự cộng dồn quan trọng
    [[mk('a', 'c1', 'X', 1, 0.1, 'paid'), mk('b', 'c1', 'X', 1, 0.2, 'paid'), mk('c', 'c2', 'X', 1, 0.3, 'paid'), mk('d', 'c2', 'X', 3, 0.7, 'refunded')], [{ sku: 'X', name: 'x', category: 'K' }]],
    // ranh giới tháng UTC
    [[mk('a', 'c1', 'X', 1, 100, 'paid', '2025-01-31T20:00:00-05:00'), mk('b', 'c1', 'X', 1, 100, 'paid', '2025-02-01T03:00:00+07:00')], [{ sku: 'X', name: 'x', category: 'K' }]],
  ];
  for (const [orders, products] of cases)
    for (const o of [{}, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }])
      assert.deepStrictEqual(buildReport(orders, products, o), ref(orders, products, o));
});

// So sánh cả JSON.stringify (bắt lệch thứ tự khóa và -0), topN lớn hơn số nhóm, nhiều seed,
// và xác nhận không sửa đầu vào (đóng băng sâu).
function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}

test('JSON giống hệt bản gốc, topN lớn, nhiều seed, đầu vào đóng băng', () => {
  const opts = [{}, { topN: 1000 }, { topN: -1 }, { from: '2025-06', to: '2025-06', topN: 2 }, { from: '2025-12', to: '2025-01' }];
  for (let seed = 20; seed < 32; seed++) {
    const d = deepFreeze(generate({ orders: 1500, products: 30, customers: 40, seed }));
    for (const o of opts) {
      const a = buildReport(d.orders, d.products, o);
      const b = ref(d.orders, d.products, o);
      assert.deepStrictEqual(a, b);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
    }
  }
  // gọi lặp lại không phụ thuộc trạng thái cũ (không cache)
  const d1 = generate({ orders: 500, seed: 7 });
  const d2 = generate({ orders: 500, seed: 8 });
  const r1 = JSON.stringify(buildReport(d1.orders, d1.products));
  buildReport(d2.orders, d2.products);
  assert.equal(JSON.stringify(buildReport(d1.orders, d1.products)), r1);
});

test('-0 và hoàn tiền bằng 0 giống bản gốc ở mức JSON', () => {
  const o = [
    { id: 'a', customerId: 'c', sku: 'X', qty: 0, unitPrice: 100, date: '2025-01-05T10:00:00Z', status: 'refunded' },
    { id: 'b', customerId: 'd', sku: 'Y', qty: 1, unitPrice: 0, date: '2025-01-06T10:00:00Z', status: 'refunded' },
  ];
  const p = [{ sku: 'X', name: 'x', category: 'K' }];
  const a = buildReport(deepFreeze(o), deepFreeze(p));
  const b = ref(o, p);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(!Object.is(a.grandTotal, -0));
});
