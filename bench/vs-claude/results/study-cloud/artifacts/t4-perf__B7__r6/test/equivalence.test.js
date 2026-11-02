'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');
const { generate } = require('../src/gen');

const optionSets = [{}, { topN: 1 }, { topN: 5 }, { topN: 0 }, { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 2 }, { from: '2026-01' }];

test('giống hệt bản cũ trên dữ liệu sinh ngẫu nhiên', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const d = generate({ orders: 3000, products: 40, customers: 60, seed });
    for (const opt of optionSets) assert.deepStrictEqual(buildReport(d.orders, d.products, opt), legacy.buildReport(d.orders, d.products, opt));
  }
});

test('giống hệt bản cũ: rỗng, sku trùng/không rõ, hoàn tiền giá 0, hòa điểm', () => {
  const products = [
    { sku: 'A', name: 'a1', category: 'X' },
    { sku: 'A', name: 'a2', category: 'Y' },
    { sku: 'B', name: 'b', category: 'X' },
  ];
  const mk = (id, c, sku, qty, p, date, status) => ({ id, customerId: c, sku, qty, unitPrice: p, date, status, extra: 1 });
  const orders = [
    mk('1', 'c2', 'A', 1, 100, '2025-01-31T23:30:00-05:00', 'paid'),
    mk('1', 'c1', 'B', 1, 100, '2025-02-01T00:00:00Z', 'paid'),
    mk('2', 'c1', 'Z', 3, 0, '2025-02-01T00:00:00Z', 'refunded'),
    mk('3', 'c3', 'B', 0, 50, '2025-02-03T00:00:00Z', 'refunded'),
    mk('4', 'c3', 'B', 2, 50, '2025-02-03T00:00:00Z', 'paid'),
    mk('5', 'c4', 'A', 1, 100, '2025-03-03T00:00:00Z', 'cancelled'),
  ];
  for (const opt of [{}, { topN: 1 }, { from: '2025-02' }, { to: '2025-01' }])
    assert.deepStrictEqual(buildReport(orders, products, opt), legacy.buildReport(orders, products, opt));
  assert.deepStrictEqual(buildReport([], products), legacy.buildReport([], products));
});

test('ném lỗi giống bản cũ khi ngày không hợp lệ', () => {
  const bad = [{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: 'x', status: 'paid' }];
  assert.throws(() => legacy.buildReport(bad, []), RangeError);
  assert.throws(() => buildReport(bad, []), RangeError);
});

// ---- bổ sung: biên, hòa điểm, -0, undefined, đóng băng đầu vào ----

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function tiny(seed, n) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = [
    { sku: 'S1', name: 'n1', category: 'C1' },
    { sku: 'S2', name: 'n2', category: 'C1' },
    { sku: 'S3', name: 'n3', category: 'C2' },
    { sku: 'S3', name: 'dup', category: 'C3' },
    { sku: 'S4', name: undefined, category: 'C2' },
    { sku: 'S5', name: 'n5' },
  ];
  const dates = ['2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00+07:00', '2025-02-28T20:00:00-05:00', '2025-03-15T12:00:00Z', '2025-04-01T00:00:00Z'];
  const orders = [];
  for (let i = 0; i < n; i++) {
    const o = {
      id: pick(['o1', 'o2', 'o3', 'o4', null]),
      customerId: pick(['c1', 'c2', 'c3', 'c4', undefined]),
      sku: pick(['S1', 'S2', 'S3', 'S4', 'S5', 'S9', undefined]),
      qty: pick([0, 1, 2, 3, -1]),
      unitPrice: pick([0, 1, 7, 100, 333]),
      date: pick(dates),
      status: pick(['paid', 'paid', 'refunded', 'cancelled', 'other']),
    };
    if (r() < 0.2) o.extra = { a: 1 };
    orders.push(o);
  }
  return { orders, products };
}

const edgeOptions = [{}, { topN: 0 }, { topN: 1 }, { topN: 100 }, { topN: null }, { topN: undefined }, { from: '2025-02' }, { to: '2025-02' }, { from: '2025-02', to: '2025-02' }, { from: '2025-03', to: '2025-02' }, { from: '', to: '' }, { from: '2024-12', to: '2025-12' }, { from: '2025-04', to: '2025-04', topN: 2 }];

test('so với bản cũ trên dữ liệu nhỏ nhiều hòa điểm / -0 / undefined / sku trùng, nhiều seed × options', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const d = tiny(seed, seed % 7 === 0 ? 0 : 5 + (seed % 40));
    for (const opt of edgeOptions) {
      const a = buildReport(d.orders, d.products, opt);
      const b = legacy.buildReport(d.orders, d.products, opt);
      assert.deepStrictEqual(a, b, `seed ${seed} opt ${JSON.stringify(opt)}`);
      // thứ tự khóa và -0 (deepStrictEqual phân biệt -0 / 0, thêm kiểm tra khóa)
      assert.deepStrictEqual(JSON.stringify(a), JSON.stringify(b));
      assert.deepStrictEqual(Object.keys(a), Object.keys(b));
      for (let i = 0; i < a.categories.length; i++) assert.deepStrictEqual(Object.keys(a.categories[i].byMonth), Object.keys(b.categories[i].byMonth));
    }
  }
});

test('không có -0 trong kết quả khi qty/giá bằng 0 và hoàn tiền', () => {
  const orders = [
    { id: '1', customerId: 'c', sku: 'A', qty: 0, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: '2', customerId: 'c', sku: 'A', qty: 2, unitPrice: 0, date: '2025-01-01T00:00:00Z', status: 'refunded' },
    { id: '3', customerId: 'd', sku: 'A', qty: -1, unitPrice: 0, date: '2025-01-01T00:00:00Z', status: 'paid' },
  ];
  const p = [{ sku: 'A', name: 'a', category: 'X' }];
  const a = buildReport(orders, p);
  assert.deepStrictEqual(a, legacy.buildReport(orders, p));
  assert.ok(!Object.is(a.grandTotal, -0) && !Object.is(a.monthly[0].revenue, -0) && !Object.is(a.topCustomers[0].revenue, -0));
});

test('không sửa đầu vào (deep-freeze) và hai lần gọi liên tiếp cho cùng kết quả', () => {
  const freeze = (x) => {
    if (x && typeof x === 'object' && !Object.isFrozen(x)) {
      Object.freeze(x);
      Object.values(x).forEach(freeze);
    }
    return x;
  };
  const d = generate({ orders: 2000, products: 30, customers: 50, seed: 5 });
  const t = tiny(3, 30);
  for (const [dd, opt] of [[d, { topN: 4 }], [t, {}]]) {
    const before = JSON.stringify(dd);
    freeze(dd);
    const r1 = buildReport(dd.orders, dd.products, freeze({ ...opt }));
    const r2 = buildReport(dd.orders, dd.products, opt);
    assert.deepStrictEqual(r1, r2);
    assert.deepStrictEqual(r1, legacy.buildReport(dd.orders, dd.products, opt));
    assert.equal(JSON.stringify(dd), before);
  }
});
