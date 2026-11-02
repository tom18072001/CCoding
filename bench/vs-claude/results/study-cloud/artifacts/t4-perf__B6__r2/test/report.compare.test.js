'use strict';
// Differential test: buildReport (src/report.js) phải cho kết quả giống hệt bản cũ (test/fixtures/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;
const { generate, rng } = require('../src/gen');

function run(fn, orders, products, options) {
  try {
    return { ok: true, value: fn(orders, products, options) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

// So sánh kết quả (hoặc loại lỗi) của hai bản; đầu vào được clone sâu để phát hiện việc sửa đầu vào.
function same(orders, products, options, label = '') {
  const snap = (x) => (x === undefined ? x : structuredClone(x));
  const a = run(legacy, snap(orders), snap(products), snap(options));
  const o2 = snap(orders), p2 = snap(products), opt2 = snap(options);
  const b = run(buildReport, o2, p2, opt2);
  assert.deepStrictEqual(b, a, label);
  assert.deepStrictEqual(o2, orders, `${label} (orders bị sửa)`);
  assert.deepStrictEqual(p2, products, `${label} (products bị sửa)`);
  return a;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
];
let n = 0;
const row = (o = {}) => ({ id: `o${++n}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid', ...o });

test('dữ liệu gen.js cỡ nhỏ, nhiều seed', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { orders, products } = generate({ orders: 2000, products: 40, customers: 60, seed });
    same(orders, products, undefined, `seed ${seed}`);
    same(orders, products, { topN: 5, from: '2025-03', to: '2025-09' }, `seed ${seed} range`);
  }
});

test('orders rỗng, products rỗng', () => {
  same([], P);
  same([], []);
  same([row()], []);
  same([], P, { topN: 0, from: '2025-01' });
});

test('toàn bộ cancelled', () => {
  same([row({ status: 'cancelled' }), row({ status: 'cancelled', sku: 'B' })], P);
});

test('from/to riêng lẻ, cả hai, from > to', () => {
  const orders = [1, 2, 3, 4, 5].map((m) => row({ date: `2025-0${m}-15T12:00:00Z` }));
  same(orders, P, { from: '2025-02' });
  same(orders, P, { to: '2025-03' });
  same(orders, P, { from: '2025-02', to: '2025-04' });
  same(orders, P, { from: '2025-04', to: '2025-02' });
  same(orders, P, { from: '2025-03', to: '2025-03' });
  same(orders, P, { from: '', to: '' });
  same(orders, P, { from: '2024-12', to: '2026-01' });
});

test('topN = 0, 1, 10, lớn hơn số sản phẩm, lạ', () => {
  const { orders, products } = generate({ orders: 1500, products: 30, customers: 50, seed: 7 });
  for (const topN of [0, 1, 2, 10, 29, 30, 31, 1000, undefined, null, -1, 2.5, NaN]) {
    same(orders, products, { topN }, `topN=${topN}`);
  }
});

test('sku không có trong products', () => {
  same([row({ sku: 'ZZ' }), row({ sku: 'ZZ', qty: 3 }), row({ sku: 'Y' }), row({ sku: undefined }), row({ sku: null }), row({ sku: NaN })], P);
});

test('sku trùng trong products (lấy cái đầu tiên)', () => {
  const prods = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }, { sku: 'B', name: 'Bút 2', category: 'Đồ uống' }];
  same([row(), row({ sku: 'B' }), row({ sku: 'C' })], prods);
  same([row({ sku: NaN })], [{ sku: NaN, name: 'n', category: 'c' }]);
  same([row({ sku: undefined })], [{ name: 'n', category: 'c' }]);
});

test('hòa revenue, qty, sku -> thứ tự sort', () => {
  const prods = ['E', 'D', 'C', 'B', 'A'].map((s) => ({ sku: s, name: `n${s}`, category: 'X' }));
  const orders = [];
  for (const s of ['C', 'A', 'E', 'B', 'D']) orders.push(row({ sku: s, qty: 2, unitPrice: 500 })); // hòa hết
  for (const s of ['B', 'A']) orders.push(row({ sku: s, qty: 1, unitPrice: 1000, id: `t${s}` })); // hòa revenue khác qty
  same(orders, prods, { topN: 10 });
  const o2 = ['c3', 'c1', 'c2'].map((c) => row({ customerId: c, sku: c === 'c1' ? 'A' : 'B' }));
  same(o2, [{ sku: 'A', name: 'a', category: 'K2' }, { sku: 'B', name: 'b', category: 'K1' }]);
  same(['c9', 'c10', 'c2', 'C1'].map((c) => row({ customerId: c })), P);
  same([1, 2, 10].map((c) => row({ customerId: c })), P);
});

test('refunded làm revenue ≤ 0 nên sản phẩm bị loại', () => {
  same([row({ status: 'refunded' }), row({ status: 'refunded', sku: 'B', qty: 3 }), row({ sku: 'C' }), row({ sku: 'C', status: 'refunded' })], P);
  same([row({ qty: 0 }), row({ sku: 'B', unitPrice: 0 }), row({ sku: 'C', qty: -2 })], P);
});

test('grandTotal = 0 (share = 0)', () => {
  same([row(), row({ status: 'refunded' })], P);
  same([row({ qty: 0 })], P);
  same([row({ qty: 5 }), row({ sku: 'B', status: 'refunded', qty: 5 })], P);
});

test('một đơn nhiều dòng, cùng khách, nhiều tháng', () => {
  const orders = [
    row({ id: 'X', sku: 'A' }), row({ id: 'X', sku: 'B' }), row({ id: 'X', sku: 'C', status: 'refunded' }),
    row({ id: 'X', date: '2025-02-10T00:00:00Z' }), row({ id: 'Y', date: '2025-02-11T00:00:00Z', status: 'refunded' }),
    row({ id: 'Y', date: '2025-03-01T00:00:00Z' }), row({ id: 'Z', customerId: 'c2', date: '2025-03-01T00:00:00Z' }),
    row({ id: 'Z', customerId: 'c2', date: '2025-03-01T00:00:00Z' }), row({ id: 1 }), row({ id: '1' }),
  ];
  same(orders, P);
});

test('múi giờ lệch đổi tháng UTC', () => {
  const dates = ['2024-01-31T23:30:00-05:00', '2024-02-01T02:00:00+07:00', '2024-03-01T00:00:00+07:00', '2024-12-31T20:00:00-05:00', '2025-01-01T00:00:00Z', '2024-02-29T23:59:59.999Z', '2024-01-31T23:59:59-00:00', '2024-05-05'];
  const orders = dates.map((d) => row({ date: d }));
  same(orders, P);
  same(orders, P, { from: '2024-02', to: '2024-02' });
  same(orders, P, { from: '2024-01', to: '2024-01' });
  same(orders, P, { to: '2024-12' });
});

test('date không hợp lệ -> cùng loại lỗi', () => {
  for (const d of ['not-a-date', '', undefined, null, 'T', '2025-13-45', NaN, {}, '+275760-09-13T00:00:01Z']) {
    const r = same([row(), row({ date: d })], P);
    if (d === 'not-a-date') assert.strictEqual(r.ok, false);
  }
  same([row({ date: 'bad', status: 'cancelled' })], P);
  same([row({ date: 'bad' })], P, { from: '2025-01' });
  same([row({ date: 12345678901234 })], P);
  same([row({ date: 0 })], P);
});

test('trường thừa trong order / product', () => {
  same([row({ extra: 1, note: { a: 1 }, foo: undefined }), row({ sku: 'B', __proto__: { x: 1 } })], [{ ...P[0], extra: 1 }, P[1]]);
  same([row({ extra: 1 })], P, { topN: 2, unknown: true });
});

test('qty / unitPrice thiếu, NaN, Infinity, chuỗi, null', () => {
  const vals = [undefined, null, NaN, Infinity, -Infinity, '3', '', 'abc', -0, 0, 1.5, -2, 1e308, true, 2 ** 53];
  for (const v of vals) {
    same([row({ qty: v }), row()], P, undefined, `qty=${String(v)}`);
    same([row({ unitPrice: v }), row({ sku: 'B' })], P, undefined, `unitPrice=${String(v)}`);
    same([row({ qty: v, status: 'refunded' }), row()], P, undefined, `refunded qty=${String(v)}`);
    same([row({ unitPrice: v, status: 'refunded' })], P, undefined, `refunded price=${String(v)}`);
  }
  const noQty = row(); delete noQty.qty;
  const noPrice = row(); delete noPrice.unitPrice;
  same([noQty, noPrice, row()], P);
  same([noQty], P);
});

test('id, customerId, status, category, name lạ hoặc thiếu', () => {
  for (const status of ['weird', undefined, null, '', 'PAID', 'Paid', 'pending', 5]) {
    same([row({ status }), row()], P, undefined, `status=${String(status)}`);
  }
  for (const v of [undefined, null, NaN, '', 0, -0, 5, '5']) {
    same([row({ id: v }), row({ customerId: v }), row({ customerId: v, id: v })], P, undefined, `id/cust=${String(v)}`);
    same([row()], [{ sku: 'A', name: v, category: v }], undefined, `name/cat=${String(v)}`);
  }
  same([row()], [{ sku: 'A' }]);
});

test('options: undefined, null, {} và kiểu lạ', () => {
  const orders = [row(), row({ date: '2025-06-01T00:00:00Z' })];
  same(orders, P, undefined);
  same(orders, P, null);
  same(orders, P, {});
  same(orders, P, { from: null, to: undefined });
  same(orders, P, { from: 202501 });
});

test('ngẫu nhiên có seed: dữ liệu bẩn trộn lẫn', () => {
  const dirty = [undefined, null, NaN, Infinity, -0, 0, '7', 'x', -3, 2.5];
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed * 7919);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const prods = [];
    for (let i = 0; i < 6; i++) prods.push({ sku: `S${Math.floor(r() * 5)}`, name: `N${i}`, category: `K${Math.floor(r() * 3)}` });
    const orders = [];
    for (let i = 0; i < 300; i++) {
      const o = {
        id: `O${Math.floor(r() * 80)}`,
        customerId: `C${Math.floor(r() * 12)}`,
        sku: r() < 0.1 ? 'NOPE' : `S${Math.floor(r() * 6)}`,
        qty: r() < 0.08 ? pick(dirty) : 1 + Math.floor(r() * 4),
        unitPrice: r() < 0.08 ? pick(dirty) : 100 * (1 + Math.floor(r() * 3)),
        date: `2025-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}T${String(Math.floor(r() * 24)).padStart(2, '0')}:00:00${pick(['Z', '+07:00', '-05:00'])}`,
        status: pick(['paid', 'paid', 'paid', 'refunded', 'cancelled', 'weird']),
      };
      if (r() < 0.03) delete o.qty;
      if (r() < 0.02) o.extra = { a: 1 };
      orders.push(o);
    }
    const opts = r() < 0.5 ? undefined : { topN: Math.floor(r() * 5), from: r() < 0.5 ? '2025-02' : undefined, to: r() < 0.5 ? '2025-10' : undefined };
    same(orders, prods, opts, `seed ${seed}`);
  }
});
