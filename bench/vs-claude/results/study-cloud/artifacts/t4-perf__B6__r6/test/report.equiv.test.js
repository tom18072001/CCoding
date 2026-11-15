'use strict';
// So sánh buildReport hiện tại với bản cũ (test/fixtures/report.legacy.js) — bản cũ là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildReport: legacy } = require('./fixtures/report.legacy');
const { buildReport: current } = require(path.join(__dirname, '..', 'src', 'report'));
const { generate, rng } = require(path.join(__dirname, '..', 'src', 'gen'));

function run(fn, orders, products, options) {
  try {
    return { ok: true, value: fn(orders, products, options) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name };
  }
}

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}

function same(orders, products, options, label) {
  const before = JSON.stringify([orders, products, options]);
  const a = run(legacy, orders, products, options);
  const b = run(current, orders, products, options);
  assert.equal(JSON.stringify([orders, products, options]), before, `${label}: đầu vào bị thay đổi`);
  assert.deepStrictEqual(b, a, label);
  return a;
}

test('dữ liệu gen.js, nhiều seed/kích thước/tùy chọn', () => {
  const optsList = [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 1000 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-02' }, { from: '2025-06', to: '2025-03' }, { from: '', to: '' }];
  let i = 0;
  for (const seed of [1, 2, 3, 7, 42, 99]) {
    for (const size of [0, 1, 5, 80, 400]) {
      const d = generate({ orders: size, products: 30, customers: 25, seed });
      same(d.orders, d.products, optsList[i++ % optsList.length], `gen seed=${seed} n=${size}`);
    }
  }
  const d = generate({ orders: 500, products: 40, customers: 20, seed: 11 });
  for (const o of optsList) same(d.orders, d.products, o, `gen opts=${JSON.stringify(o)}`);
});

test('đầu vào rỗng, toàn cancelled, grandTotal = 0', () => {
  same([], [], undefined, 'rỗng');
  same([], [{ sku: 'A', name: 'x', category: 'c' }], { topN: 2 }, 'rỗng có products');
  const base = { customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-01T00:00:00Z' };
  const prods = [{ sku: 'A', name: 'a', category: 'K' }];
  same([{ ...base, id: 1, status: 'cancelled' }, { ...base, id: 2, status: 'cancelled' }], prods, {}, 'all cancelled');
  same([{ ...base, id: 1, status: 'paid' }, { ...base, id: 2, status: 'refunded' }], prods, {}, 'grandTotal=0');
  same([{ ...base, id: 1, status: 'paid', unitPrice: 0 }], prods, {}, 'giá 0');
});

test('ngày không hợp lệ: cùng loại lỗi', () => {
  const prods = [{ sku: 'A', name: 'a', category: 'K' }];
  for (const date of ['không phải ngày', '', undefined, '2025-13-45', NaN, {}]) {
    const r = same([{ id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date, status: 'paid' }], prods, {}, `date=${String(date)}`);
    assert.equal(r.ok, false);
    assert.equal(r.name, 'RangeError');
  }
  same([{ id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: null, status: 'paid' }], prods, {}, 'date=null');
  // dòng lỗi nằm sau dòng bị lọc/cancelled vẫn phải ném
  const good = { id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'cancelled' };
  const r = same([good, { ...good, date: 'xxx' }], prods, { from: '2025-05' }, 'lỗi sau dòng bị lọc');
  assert.equal(r.ok, false);
});

test('ngày ở biên tháng và múi giờ', () => {
  const dates = ['2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-01-31T23:59:59-05:00', '2025-02-01T06:59:59+07:00', '2025-03-01T00:30:00+01:00', '2024-12-31T20:00:00-08:00', '2024-02-29T23:00:00Z', '2025-12-31T23:59:59.999Z', '2025-06-15', '2025-06-15T12:00:00Z', 1735689600000];
  const prods = [{ sku: 'A', name: 'a', category: 'K' }];
  const orders = dates.map((date, i) => ({ id: `o${i}`, customerId: `c${i % 3}`, sku: 'A', qty: 1 + i, unitPrice: 100, date, status: i % 4 === 3 ? 'refunded' : 'paid' }));
  for (const o of [{}, { from: '2025-01', to: '2025-01' }, { from: '2025-02' }, { to: '2024-12' }, { from: '2025-02', to: '2025-03' }, { from: '2025-13' }, { from: '2025-1' }, { to: '' }, { from: null, to: undefined }]) {
    same(orders, prods, o, `biên ${JSON.stringify(o)}`);
  }
});

test('fuzz có seed cố định', () => {
  const weird = [0, -0, 1, 2, 3, 5, -1, -3, 0.5, 2.25, 1e-7, 1e15, 1e308, NaN, Infinity, -Infinity, undefined, null, '3', '', 'abc', true];
  const skus = ['A', 'B', 'C', 'D', 'GONE', 'a', '', undefined, null, NaN, 1, '1'];
  const statuses = ['paid', 'refunded', 'cancelled', 'PAID', 'pending', undefined, null];
  const cats = ['K1', 'K2', 'K3', 'k1', '', undefined, null, 5, NaN];
  const ids = ['o1', 'o2', 'o3', 'o4', 1, '1', undefined, null, NaN];
  const custs = ['c1', 'c2', 'c3', 'C1', 1, '1', undefined, null, NaN];
  const dates = ['2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-02-01T03:00:00+07:00', '2025-03-10T10:00:00Z', '2025-03-31T20:00:00-05:00', '2025-04-01T00:00:00Z', '2024-12-31T23:00:00Z'];
  const topNs = [undefined, 0, 1, 2, 3, 5, 100, null, -1, 1.5];
  const ranges = [{}, {}, { from: '2025-02' }, { to: '2025-03' }, { from: '2025-02', to: '2025-03' }, { from: '2025-03', to: '2025-02' }, { from: '', to: '' }, { from: '2025-01', to: '2025-01' }];
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed * 7919);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const nProd = Math.floor(r() * 8);
    const products = [];
    for (let i = 0; i < nProd; i++) {
      const p = { sku: pick(skus), name: r() < 0.1 ? undefined : `P${Math.floor(r() * 4)}`, category: pick(cats) };
      if (r() < 0.1) p.extra = { x: 1 };
      products.push(p);
    }
    const n = Math.floor(r() * 40);
    const orders = [];
    const useWeird = r() < 0.5;
    for (let i = 0; i < n; i++) {
      const o = {
        id: pick(ids),
        customerId: pick(custs),
        sku: pick(skus),
        qty: useWeird && r() < 0.5 ? pick(weird) : Math.floor(r() * 4),
        unitPrice: useWeird && r() < 0.5 ? pick(weird) : pick([100, 100, 250, 0, -100, 99.5]),
        date: pick(dates),
        status: r() < 0.7 ? pick(['paid', 'refunded', 'cancelled']) : pick(statuses),
      };
      if (r() < 0.15) o.note = { nested: [1, 2], s: 'x' };
      if (r() < 0.05) o.month = 'sai';
      if (r() < 0.05) o.amount = 123;
      if (r() < 0.05) delete o.qty;
      orders.push(o);
      if (r() < 0.2) orders.push({ ...o });
    }
    const opts = { ...pick(ranges), topN: pick(topNs) };
    if (opts.topN === undefined) delete opts.topN;
    same(orders, products, opts, `fuzz seed=${seed}`);
  }
});

test('tie-break khi revenue bằng nhau', () => {
  const prods = ['A', 'B', 'C', 'D', 'E', 'F'].map((s, i) => ({ sku: s, name: s, category: i % 2 ? 'Y' : 'X' }));
  const orders = [];
  ['F', 'A', 'E', 'B', 'D', 'C'].forEach((sku, i) => {
    orders.push({ id: `o${i}`, customerId: ['z', 'a', 'm', 'b', 'y', 'c', 'x'][i], sku, qty: i % 2 ? 2 : 1, unitPrice: i % 2 ? 50 : 100, date: '2025-05-05T00:00:00Z', status: 'paid' });
  });
  for (const topN of [0, 1, 2, 3, 10]) same(orders, prods, { topN }, `tie topN=${topN}`);
  const many = generate({ orders: 300, products: 5, customers: 12, seed: 5 });
  for (const o of many.orders) { o.qty = 1; o.unitPrice = 1000; o.status = 'paid'; }
  same(many.orders, many.products, { topN: 10 }, 'tie nhiều');
});

test('trùng sku trong products, sku không có, trường dư, nhiều dòng cùng id', () => {
  const products = [
    { sku: 'A', name: 'đầu', category: 'K1', extra: 1 },
    { sku: 'A', name: 'sau', category: 'K2' },
    { sku: 'B', name: 'b', category: 'K1' },
  ];
  const orders = [];
  for (let i = 0; i < 30; i++) {
    orders.push({ id: `o${i % 4}`, customerId: `c${i % 3}`, sku: ['A', 'B', 'ZZ', 'A'][i % 4], qty: 1 + (i % 3), unitPrice: 100, date: `2025-0${1 + (i % 3)}-1${i % 9}T10:00:00Z`, status: ['paid', 'refunded', 'cancelled', 'paid'][i % 4], promo: { code: i }, tags: ['x'] });
  }
  same(orders, products, {}, 'trùng sku');
  same(orders, products, { topN: 1 }, 'trùng sku topN=1');
});

test('không mutate đầu vào (deep-freeze) và kết quả không dùng chung tham chiếu', () => {
  const d = generate({ orders: 200, products: 20, customers: 10, seed: 8 });
  d.orders[0].extra = { a: [1] };
  const opts = { topN: 2, from: '2025-01' };
  deepFreeze(d);
  deepFreeze(opts);
  const a = legacy(d.orders, d.products, opts);
  const b = current(d.orders, d.products, opts);
  assert.deepStrictEqual(b, a);
  const inputRefs = new Set();
  (function walk(x) { if (x && typeof x === 'object') { inputRefs.add(x); Object.values(x).forEach(walk); } })(d);
  (function walk(x) { if (x && typeof x === 'object') { assert.ok(!inputRefs.has(x), 'kết quả dùng chung tham chiếu với đầu vào'); Object.values(x).forEach(walk); } })(b);
});

test('gọi lặp lại cho kết quả như nhau (không cache/trạng thái chung)', () => {
  const d = generate({ orders: 300, products: 20, customers: 10, seed: 21 });
  const first = current(d.orders, d.products, {});
  const other = generate({ orders: 100, products: 5, customers: 4, seed: 22 });
  current(other.orders, other.products, { topN: 1 });
  assert.deepStrictEqual(current(d.orders, d.products, {}), first);
  assert.deepStrictEqual(first, legacy(d.orders, d.products, {}));
});
