'use strict';
// Đối chiếu buildReport hiện tại với bản cũ (test/fixtures/report.legacy.js, chụp từ git HEAD).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport: next } = require('../src/report');
const { buildReport: legacy } = require('./fixtures/report.legacy');
const { generate } = require('../src/gen');

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}
const clone = (x) => structuredClone(x);

// So sánh kết quả (hoặc lỗi) của hai bản; đầu vào được deep-freeze nên nếu bị sửa sẽ ném lỗi/khác kết quả.
function same(orders, products, options) {
  const run = (fn) => {
    const o = deepFreeze(clone(orders));
    const p = deepFreeze(clone(products));
    const op = options === undefined ? undefined : deepFreeze(clone(options));
    try {
      return { ok: true, value: op === undefined ? fn(o, p) : fn(o, p, op) };
    } catch (e) {
      return { ok: false, name: e.name, message: e.message };
    }
  };
  const a = run(legacy);
  const b = run(next);
  assert.deepStrictEqual(b, a);
  return a;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
];
let n = 0;
const row = (o = {}) => ({ id: `o${++n}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-03-10T10:00:00Z', status: 'paid', ...o });

// ---- dữ liệu sinh ----
const seeds = [1, 2, 3, 7, 42, 99, 123, 2024, 31337, 777];
const sizes = [500, 1500, 3000];
for (const seed of seeds) {
  for (const orders of sizes.slice(0, seed % 2 ? 3 : 2)) {
    for (const opt of [undefined, { topN: 5 }]) {
      test(`gen seed=${seed} orders=${orders} opt=${JSON.stringify(opt)}`, () => {
        const d = generate({ orders, products: 80, customers: 60, seed });
        same(d.orders, d.products, opt);
      });
    }
  }
}
test('gen với from/to và topN khác nhau', () => {
  const d = generate({ orders: 2000, products: 100, customers: 50, seed: 5 });
  for (const opt of [{ from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 1 }, { topN: 0 }, { topN: 1000 }, { from: '2026-01' }, { from: '2025-08', to: '2025-02' }]) same(d.orders, d.products, opt);
});

// ---- trường hợp biên ----
test('mảng rỗng', () => {
  same([], []);
  same([], P, { topN: 2 });
  same([row()], []);
});
test('tất cả cancelled', () => {
  same([row({ status: 'cancelled' }), row({ status: 'cancelled', sku: 'B' })], P);
});
test('grandTotal bằng 0', () => {
  same([row({ id: 'x' }), row({ id: 'x', status: 'refunded' })], P);
  same([row({ qty: 0 }), row({ sku: 'B', qty: 0 })], P);
});
test('hòa doanh thu giữa sản phẩm / danh mục / khách', () => {
  const orders = [
    row({ sku: 'A', customerId: 'cb' }),
    row({ sku: 'B', customerId: 'ca' }),
    row({ sku: 'C', customerId: 'cc' }),
    row({ sku: 'Z1', customerId: 'cd' }),
    row({ sku: 'Z2', customerId: 'ce' }),
  ];
  for (const topN of [0, 1, 2, 3, 10]) same(orders, P, { topN });
  same([row({ sku: 'A', qty: 2, unitPrice: 500 }), row({ sku: 'C', qty: 1, unitPrice: 1000 })], P);
  same([row({ sku: 'A', qty: 2, unitPrice: 500 }), row({ sku: 'C', qty: 2, unitPrice: 500 })], P);
});
test('hòa giữa hơn 5 khách', () => {
  const orders = [];
  for (const c of ['c9', 'c1', 'c5', 'c3', 'c7', 'c2', 'c8', 'c4']) orders.push(row({ customerId: c }));
  same(orders, P);
});
test('sku không có trong products', () => {
  same([row({ sku: 'NOPE' }), row({ sku: 'NOPE2', qty: 3 }), row({ sku: 'A' })], P);
});
test('sku trùng trong products', () => {
  const dup = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }, { sku: 'B', name: 'Bút 2', category: 'Văn phòng phẩm' }];
  same([row({ sku: 'A' }), row({ sku: 'B' })], dup);
});
test('refund lớn hơn paid', () => {
  same([row({ qty: 1 }), row({ qty: 5, status: 'refunded' })], P);
  same([row({ status: 'refunded', customerId: 'c2' })], P);
});
test('một đơn nhiều dòng; đơn có cả paid và refunded', () => {
  same([row({ id: 'm' }), row({ id: 'm', sku: 'B' }), row({ id: 'm', sku: 'C', qty: 3 })], P);
  same([row({ id: 'm' }), row({ id: 'm', status: 'refunded', sku: 'B' }), row({ id: 'm', status: 'paid', customerId: 'c2' })], P);
  same([row({ id: 'm', status: 'refunded' }), row({ id: 'm', status: 'refunded', date: '2025-04-01T00:00:00Z' })], P);
});
test('múi giờ đổi tháng UTC', () => {
  same(
    [
      row({ date: '2025-03-01T02:00:00+07:00' }), // 2025-02 UTC
      row({ date: '2025-02-28T23:30:00-05:00' }), // 2025-03 UTC
      row({ date: '2025-12-31T23:59:59Z' }),
      row({ date: '2026-01-01T00:00:00+01:00' }),
    ],
    P,
  );
  same([row({ date: '2025-03-01T02:00:00+07:00' }), row({ date: '2025-03-01T10:00:00Z' })], P, { from: '2025-03', to: '2025-03' });
});
test('lọc from/to', () => {
  const orders = ['2025-01-15', '2025-02-15', '2025-03-15', '2025-04-15'].map((d) => row({ date: `${d}T12:00:00Z` }));
  for (const opt of [{ from: '2025-02' }, { to: '2025-03' }, { from: '2025-02', to: '2025-03' }, { from: '2025-03', to: '2025-02' }, { from: '', to: '' }, { from: '2025', to: '2025-02' }, { from: undefined, to: null }]) same(orders, P, opt);
});
test('topN = 0, 1, lớn, null, undefined', () => {
  const d = generate({ orders: 600, products: 30, customers: 20, seed: 11 });
  for (const topN of [0, 1, 2, 1e6, undefined, null, 2.5, -1]) same(d.orders, d.products, { topN });
});
test('options mặc định', () => {
  same([row()], P);
  same([row()], P, {});
});
test('id / customerId kiểu số hoặc chuỗi', () => {
  same([row({ id: 1, customerId: 1 }), row({ id: '1', customerId: '1' }), row({ id: 2, customerId: 2 }), row({ id: 10, customerId: 10 }), row({ id: '10', customerId: '9' })], P);
  same([row({ id: 1, customerId: 10 }), row({ id: 2, customerId: 9 }), row({ id: 3, customerId: 'x' })], P);
});
test('qty bằng 0', () => {
  same([row({ qty: 0 }), row({ qty: 0, status: 'refunded' }), row({ qty: 2 })], P);
});
test('giá trị lạ (NaN, Infinity, -0, thiếu trường)', () => {
  same([row({ qty: NaN }), row({ unitPrice: Infinity }), row({ qty: -0, status: 'refunded' }), row({ sku: undefined }), row({ id: undefined, customerId: undefined }), row({ id: NaN })], P);
  same([row({ sku: NaN }), row({ sku: NaN }), row({ sku: null })], [...P, { sku: NaN, name: 'n', category: 'c' }]);
  same([row({ status: 'weird' }), row({ qty: 1.5, unitPrice: 333 })], P);
  same([row()], [{ sku: 'A' }, { sku: 'B', name: 'x', category: undefined }]);
});
test('share làm tròn', () => {
  same([row({ sku: 'A', unitPrice: 1 }), row({ sku: 'B', unitPrice: 2 }), row({ sku: 'Q', unitPrice: 4 })], P);
});

// ---- date không hợp lệ ----
test('date không hợp lệ: cùng ném lỗi', () => {
  for (const date of ['không phải ngày', '', undefined, 'NaN']) {
    const r = same([row(), row({ date })], P);
    assert.equal(r.ok, false);
  }
  const r = same([row({ date: 'bad', status: 'cancelled' })], P, { from: '2025-01' });
  assert.equal(r.ok, false);
});

// ---- bất biến đầu vào ----
test('đầu vào không bị sửa đổi, không có trạng thái chung giữa các lần gọi', () => {
  const d = generate({ orders: 1500, products: 60, customers: 40, seed: 8 });
  const before = clone(d);
  const opt = { topN: 4, from: '2025-02' };
  const r1 = next(d.orders, d.products, opt);
  assert.deepStrictEqual(d, before);
  assert.deepStrictEqual(opt, { topN: 4, from: '2025-02' });
  assert.deepStrictEqual(next(d.orders, d.products, opt), r1);
  deepFreeze(d);
  assert.deepStrictEqual(next(d.orders, d.products, opt), legacy(d.orders, d.products, opt));
});

// ---- hiệu năng (dữ liệu giống bench/run.js) ----
test('200.000 dòng < 1000ms', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = process.hrtime.bigint();
  const rep = next(d.orders, d.products, { topN: 5 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(rep.categories.length > 0);
  assert.ok(ms < 1000, `mất ${ms.toFixed(0)}ms (ngưỡng 1000ms)`);
});
