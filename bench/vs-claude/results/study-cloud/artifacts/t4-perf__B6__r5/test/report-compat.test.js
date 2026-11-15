'use strict';
// Differential test: buildReport hiện tại phải cho kết quả y hệt bản cũ (test/fixtures/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;
const { generate } = require('../src/gen');

// PRNG tự viết (mulberry32), seed cố định.
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

function run(fn, orders, products, options) {
  const o = structuredClone(orders);
  const p = structuredClone(products);
  const opt = options === undefined ? undefined : structuredClone(options);
  let out;
  try {
    out = { value: opt === undefined ? fn(o, p) : fn(o, p, opt) };
  } catch (e) {
    out = { error: e };
  }
  // không được sửa đầu vào
  assert.deepStrictEqual(o, orders, 'orders bị sửa');
  assert.deepStrictEqual(p, products, 'products bị sửa');
  if (opt !== undefined) assert.deepStrictEqual(opt, options, 'options bị sửa');
  return out;
}

function compare(orders, products, options, label = '') {
  const a = run(legacy, orders, products, options);
  const b = run(buildReport, orders, products, options);
  if (a.error || b.error) {
    assert.ok(a.error && b.error, `${label}: một bên ném lỗi, bên kia không (legacy=${a.error?.name}, mới=${b.error?.name})`);
    assert.strictEqual(b.error.constructor, a.error.constructor, `${label}: khác loại lỗi`);
    assert.strictEqual(b.error.name, a.error.name);
    return null;
  }
  assert.deepStrictEqual(b.value, a.value, label);
  assert.deepStrictEqual(
    b.value.categories.map((c) => Object.keys(c.byMonth)),
    a.value.categories.map((c) => Object.keys(c.byMonth)),
    `${label}: thứ tự khóa byMonth`
  );
  assert.deepStrictEqual(Object.keys(b.value), Object.keys(a.value));
  assert.strictEqual(JSON.stringify(b.value), JSON.stringify(a.value), `${label}: JSON`);
  return a.value;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
];
const ord = (id, customerId, sku, qty, unitPrice, date, status = 'paid', extra = {}) => ({ id, customerId, sku, qty, unitPrice, date, status, ...extra });

test('dữ liệu gen.js: nhiều seed, kích thước nhỏ, nhiều options', () => {
  const optionSets = [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 1000 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-04', to: '2025-04' }, { from: '2025-06', to: '2025-02' }, { from: '', to: '', topN: 2 }, { from: '2024-01', to: '2024-12' }];
  for (let seed = 1; seed <= 25; seed++) {
    const sizes = [0, 1, 2, 7, 50, 300, 1500];
    const n = sizes[seed % sizes.length];
    const d = generate({ orders: n, products: 1 + (seed % 30), customers: 1 + (seed % 40), seed });
    for (const [i, opt] of optionSets.entries()) compare(d.orders, d.products, opt, `gen seed=${seed} n=${n} opt=${i}`);
  }
});

test('trường hợp biên viết tay', () => {
  const D = '2025-01-05T10:00:00Z';
  // orders rỗng, products rỗng
  compare([], P, undefined, 'rỗng');
  compare([], [], { topN: 0 }, 'rỗng cả hai');
  compare([ord('1', 'c', 'A', 1, 100, D)], [], undefined, 'products rỗng');
  // sku trùng trong products (lấy dòng đầu), sku không có
  const dup = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }];
  compare([ord('1', 'c', 'A', 1, 100, D), ord('2', 'c', 'ZZ', 2, 50, D)], dup, undefined, 'sku trùng/không có');
  // cancelled / refunded
  compare([ord('1', 'c', 'A', 1, 100, D, 'cancelled'), ord('2', 'c', 'A', 3, 100, D, 'refunded'), ord('3', 'd', 'B', 2, 10, D)], P, undefined, 'status');
  compare([ord('1', 'c', 'A', 1, 100, D, 'cancelled')], P, undefined, 'chỉ cancelled');
  // grandTotal = 0
  compare([ord('1', 'c', 'A', 1, 100, D), ord('2', 'c', 'A', 1, 100, D, 'refunded')], P, undefined, 'grandTotal 0');
  compare([ord('1', 'c', 'A', 5, 0, D)], P, undefined, 'giá 0');
  // hoà doanh thu sản phẩm / danh mục / khách
  compare(
    [ord('1', 'c2', 'A', 1, 100, D), ord('2', 'c1', 'C', 1, 100, D), ord('3', 'c3', 'B', 1, 100, D), ord('4', 'c0', 'A', 2, 50, D)],
    P, { topN: 5 }, 'hoà'
  );
  compare([ord('1', 'c1', 'A', 1, 100, D), ord('2', 'c1', 'C', 2, 50, D)], P, undefined, 'hoà revenue khác qty');
  // một đơn nhiều dòng, nhiều tháng
  compare([ord('1', 'c', 'A', 1, 100, D), ord('1', 'c', 'B', 2, 100, D), ord('1', 'c', 'B', 2, 100, '2025-03-01T00:00:00Z'), ord('1', 'c', 'A', 1, 100, D, 'refunded')], P, undefined, 'nhiều dòng');
  // tháng không có dữ liệu cho một category
  compare([ord('1', 'c', 'A', 1, 100, '2025-01-05T00:00:00Z'), ord('2', 'c', 'B', 1, 100, '2025-02-05T00:00:00Z'), ord('3', 'c', 'B', 1, 100, '2024-12-05T00:00:00Z')], P, undefined, 'tháng thiếu');
  // topN
  for (const topN of [0, 1, 2, 100, -1, undefined, null, 1.5]) compare([ord('1', 'c', 'A', 1, 100, D), ord('2', 'c', 'C', 2, 100, D), ord('3', 'c', 'B', 3, 100, D)], P, { topN }, `topN=${topN}`);
  // from/to
  for (const [from, to] of [[undefined, undefined], ['', ''], ['2025-01', undefined], [undefined, '2025-01'], ['2025-02', '2025-03'], ['2025-01', '2025-01'], [null, null]])
    compare([ord('1', 'c', 'A', 1, 100, D), ord('2', 'c', 'B', 1, 100, '2025-02-10T00:00:00Z')], P, { from, to }, `from=${from} to=${to}`);
  // múi giờ lệch: tháng UTC khác ngày địa phương
  compare(
    [ord('1', 'c', 'A', 1, 100, '2025-02-01T03:00:00+07:00'), ord('2', 'c', 'A', 1, 100, '2025-01-31T22:00:00-05:00'), ord('3', 'c', 'B', 1, 100, '2025-03-01T00:30:00+01:00')],
    P, undefined, 'múi giờ'
  );
  compare([ord('1', 'c', 'A', 1, 100, '2025-02-01T03:00:00+07:00')], P, { from: '2025-02' }, 'múi giờ + from');
  // trường thừa
  compare([ord('1', 'c', 'A', 1, 100, D, 'paid', { note: 'x', tags: ['a', { b: 1 }], extra: { z: undefined, n: NaN }, month: 'hack', amount: 5, category: 'Q' })], P, undefined, 'trường thừa');
  // date không hợp lệ -> cùng loại lỗi
  for (const bad of ['không phải ngày', '', undefined, null, {}, 'abc-01-01', NaN])
    compare([ord('1', 'c', 'A', 1, 100, D), ord('2', 'c', 'A', 1, 100, bad)], P, undefined, `date xấu ${String(bad)}`);
  // date là số / Date
  compare([ord('1', 'c', 'A', 1, 100, 1736071200000)], P, undefined, 'date số');
  compare([ord('1', 'c', 'A', 1, 100, new Date(D))], P, undefined, 'date Date');
  // date xấu đi cùng cancelled / bộ lọc (bản cũ ném trước khi lọc)
  compare([ord('1', 'c', 'A', 1, 100, 'xxx', 'cancelled')], P, undefined, 'date xấu + cancelled');
  compare([ord('1', 'c', 'A', 1, 100, 'xxx')], P, { from: '2030-01' }, 'date xấu + from');
});

test('qty/unitPrice thiếu, NaN, null, kiểu lạ', () => {
  const D = '2025-01-05T10:00:00Z';
  const vals = [undefined, null, NaN, Infinity, -Infinity, 0, -0, -3, 1.5, '2', 'x', '', true, false, 1e308, 0.1, 0.2, [], [5], {}];
  for (const q of vals) {
    for (const u of [100, undefined, null, NaN, '7', 0, -0.5, 1e308]) {
      for (const st of ['paid', 'refunded']) {
        const o = { id: 'o', customerId: 'c', sku: 'A', qty: q, unitPrice: u, date: D, status: st };
        compare([o, ord('p', 'd', 'B', 1, 10, D)], P, undefined, `qty=${String(q)} u=${String(u)} ${st}`);
      }
    }
  }
  // thiếu hẳn khóa
  compare([{ id: '1', customerId: 'c', sku: 'A', date: D, status: 'paid' }, { id: '2', customerId: 'c', sku: 'A', qty: 1, date: D, status: 'paid' }], P, undefined, 'thiếu khóa');
  // id / customerId / sku / status kiểu lạ
  for (const v of [undefined, null, NaN, 0, -0, 1, '', 'x', true, {}, []]) {
    compare([ord(v, 'c', 'A', 1, 10, D), ord('2', v, 'A', 1, 10, D), ord('3', 'c', v, 1, 10, D), ord('4', 'c', 'A', 1, 10, D, v)], P, undefined, `id/cust/sku/status=${String(v)}`);
    compare([ord('1', 'c', 'A', 1, 10, D)], [{ sku: v, name: 'n', category: 'k' }, { sku: 'A', name: v, category: v }], undefined, `product field=${String(v)}`);
  }
  compare([ord('1', 'c', NaN, 1, 10, D)], [{ sku: NaN, name: 'n', category: 'k' }], undefined, 'sku NaN cả hai');
  compare([ord('1', 'c', 'A', 1, 10, D, 'weird')], P, undefined, 'status lạ');
});

test('ngẫu nhiên có seed cố định', () => {
  const dates = ['2025-01-05T10:00:00Z', '2025-01-31T23:59:59Z', '2025-02-01T00:00:00+07:00', '2025-02-28T20:00:00-08:00', '2025-03-15T12:00:00Z', '2024-12-31T23:00:00-02:00', '2025-12-01T01:00:00+14:00'];
  const statuses = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
  const months = [undefined, '', '2024-12', '2025-01', '2025-02', '2025-03', '2025-12'];
  for (let seed = 1; seed <= 150; seed++) {
    const r = prng(seed * 7919);
    const nProd = r.int(6);
    const skuPool = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const cats = ['X', 'Y', 'Z', 'Đồ uống'];
    const products = [];
    for (let i = 0; i < nProd; i++) products.push({ sku: r.pick(skuPool), name: `N${r.int(3)}`, category: r.pick(cats) });
    const n = r.int(60);
    const orders = [];
    for (let i = 0; i < n; i++) {
      const o = {
        id: `o${r.int(15)}`,
        customerId: `c${r.int(8)}`,
        sku: r.pick(skuPool),
        qty: r.next() < 0.05 ? r.pick([undefined, null, NaN, '3', 0]) : r.int(4),
        unitPrice: r.next() < 0.05 ? r.pick([undefined, null, NaN, 0]) : r.pick([100, 100, 250, 0.1, 0.2, 1000]),
        date: r.pick(dates),
        status: r.pick(statuses),
      };
      if (r.next() < 0.1) o.extra = { k: r.int(5) };
      orders.push(o);
    }
    const options = r.next() < 0.2 ? undefined : { topN: r.pick([0, 1, 2, 3, 50, undefined]), from: r.pick(months), to: r.pick(months) };
    compare(orders, products, options, `random seed=${seed}`);
  }
});

test('kích thước vừa với gen.js (hoà điểm dày)', () => {
  const d = generate({ orders: 6000, products: 8, customers: 5, seed: 42 });
  compare(d.orders, d.products, { topN: 4 }, 'vừa');
  const flat = d.orders.map((o) => ({ ...o, qty: 1, unitPrice: 100 }));
  compare(flat, d.products, { topN: 10 }, 'hoà dày');
});
