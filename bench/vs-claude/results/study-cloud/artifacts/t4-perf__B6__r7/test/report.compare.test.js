'use strict';
// Differential test: so sánh buildReport mới (src/) với bản cũ (test/fixtures/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('./fixtures/report.legacy').buildReport;
const { buildReport } = require('../src/report');
const { generate, rng } = require('../src/gen');

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

function same(orders, products, options, label = '') {
  const a = legacy(clone(orders), clone(products), options === undefined ? undefined : clone(options));
  const b = buildReport(clone(orders), clone(products), options === undefined ? undefined : clone(options));
  assert.deepStrictEqual(b, a, label);
  return a;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
];
const o = (id, customerId, sku, qty, unitPrice, date, status = 'paid') => ({ id, customerId, sku, qty, unitPrice, date, status });

test('dữ liệu sinh ngẫu nhiên nhiều seed × nhiều options', () => {
  const optionsList = [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 1000 }, { topN: undefined }, { from: '2025-03' }, { to: '2025-09' },
    { from: '2025-03', to: '2025-09' }, { from: '', to: '' }, { from: '2025-09', to: '2025-03' }, { from: '2025-05', to: '2025-05', topN: 2 }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = generate({ orders: 300 + seed * 200, products: 5 + seed * 10, customers: 3 + seed * 20, seed });
    for (const opt of optionsList) same(d.orders, d.products, opt, `seed ${seed} ${JSON.stringify(opt)}`);
  }
});

test('đủ 3 status, sku không có, sku trùng trong products', () => {
  const prods = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }];
  const orders = [
    o('1', 'x', 'A', 2, 100, '2025-01-01T00:00:00Z'),
    o('2', 'y', 'A', 1, 100, '2025-01-02T00:00:00Z', 'refunded'),
    o('3', 'y', 'B', 1, 100, '2025-01-02T00:00:00Z', 'cancelled'),
    o('4', 'z', 'ZZ', 3, 70, '2025-02-02T00:00:00Z'),
  ];
  same(orders, prods);
  same(orders, P);
});

test('products rỗng, orders rỗng, cả hai rỗng', () => {
  const orders = [o('1', 'x', 'A', 2, 100, '2025-01-01T00:00:00Z')];
  same(orders, []);
  same([], P);
  same([], []);
  same([], P, { topN: 0, from: '2025-01' });
});

test('ranh giới tháng UTC, múi giờ +07:00 / -05:00, năm nhuận', () => {
  const dates = ['2024-01-31T23:30:00-05:00', '2024-02-01T06:30:00+07:00', '2024-01-31T17:00:00+07:00', '2024-01-01T00:30:00+07:00',
    '2024-02-29T23:59:59Z', '2024-02-29T23:30:00-05:00', '2024-03-01T00:00:00Z', '2023-02-28T23:59:59Z', '2023-03-01T06:59:00+07:00',
    '2024-12-31T20:00:00-05:00', '2025-01-01T06:59:59+07:00', '2025-01-01T07:00:00+07:00'];
  const orders = dates.map((d, i) => o(`o${i}`, `c${i % 3}`, P[i % 3].sku, 1 + (i % 4), 100 * (i + 1), d, ['paid', 'refunded', 'paid'][i % 3]));
  for (const opt of [undefined, { from: '2024-02' }, { to: '2024-01' }, { from: '2024-01', to: '2024-02' }, { from: '2024-03', to: '2024-01' }, { from: '', to: '2024-02' }]) {
    same(orders, P, opt, JSON.stringify(opt));
  }
});

test('hòa điểm revenue / qty / sku, id & customerId là số hoặc chuỗi', () => {
  const prods = ['S3', 'S1', 'S2', 'S4'].map((s) => ({ sku: s, name: 'n' + s, category: 'K' }));
  const orders = [
    o(1, 1, 'S3', 2, 50, '2025-01-01T00:00:00Z'), o(1, '1', 'S1', 2, 50, '2025-01-01T00:00:00Z'),
    o('1', 2, 'S2', 4, 25, '2025-01-01T00:00:00Z'), o(2, 'a', 'S4', 1, 100, '2025-01-01T00:00:00Z'),
    o(3, 10, 'S1', 1, 5, '2025-01-01T00:00:00Z'), o(4, 9, 'S2', 1, 5, '2025-01-01T00:00:00Z'),
    o(5, 'B', 'S3', 1, 5, '2025-02-01T00:00:00Z'), o(6, 'b', 'S3', 1, 5, '2025-02-01T00:00:00Z'),
  ];
  for (const topN of [0, 1, 2, 3, 10]) same(orders, prods, { topN });
  const p2 = [{ sku: 'X', name: 'x', category: 'Zeta' }, { sku: 'Y', name: 'y', category: 'Alpha' }];
  same([o(1, 1, 'X', 1, 10, '2025-01-01T00:00:00Z'), o(2, 2, 'Y', 1, 10, '2025-01-01T00:00:00Z')], p2);
});

test('doanh thu 0 / âm, grandTotal = 0, qty = 0, refund làm revenue ≤ 0', () => {
  const d = '2025-01-10T00:00:00Z';
  same([o(1, 'a', 'A', 1, 0, d), o(2, 'b', 'B', 0, 500, d)], P);
  same([o(1, 'a', 'A', 2, 100, d), o(2, 'a', 'A', 2, 100, d, 'refunded')], P);
  same([o(1, 'a', 'A', 1, 100, d), o(2, 'a', 'A', 3, 100, d, 'refunded'), o(3, 'b', 'C', 1, 50, d)], P, { topN: 5 });
  same([o(1, 'a', 'A', 1, -100, d), o(2, 'b', 'B', -2, 100, d)], P);
  same([o(1, 'a', 'A', 1, 100, d, 'refunded')], P);
  same([o(1, 'a', 'A', 1, 100, d, 'cancelled')], P);
  same([o(1, 'a', 'A', 1, 100, d), o(2, 'b', 'B', 1, 100, d, 'refunded')], P); // grandTotal 0
});

test('trường thiếu / giá trị lạ', () => {
  const d = '2025-01-10T00:00:00Z';
  const odd = [
    { id: 1, customerId: 'a', sku: 'A', qty: 1, unitPrice: 10, date: d },
    { id: 2, customerId: 'a', sku: 'A', qty: 1, unitPrice: 10, date: d, status: 'PAID' },
    { id: 3, sku: 'A', qty: 2, unitPrice: 10, date: d, status: 'paid' },
    { id: 4, customerId: 'b', qty: 2, unitPrice: 10, date: d, status: 'paid' },
    { id: 5, customerId: 'b', sku: 'B', qty: 2, date: d, status: 'paid' },
    { id: undefined, customerId: null, sku: 'B', qty: 1, unitPrice: 1, date: d, status: 'paid' },
    { id: 6, customerId: 'c', sku: 'B', qty: 0.5, unitPrice: 0.1, date: 1735689600000, status: 'paid' },
  ];
  // so sánh trực tiếp (không clone) để cả hai bản thấy cùng input; chấp nhận cùng ném lỗi
  const run = (fn, x) => { try { return { v: fn([x], P) }; } catch (e) { return { e: `${e.name}: ${e.message}` }; } };
  for (const x of odd) assert.deepStrictEqual(run(buildReport, x), run(legacy, x), JSON.stringify(x));
  assert.deepStrictEqual(run(buildReport, odd[0]), run(legacy, odd[0]));
});

test('ngày không hợp lệ: cùng loại lỗi và message', () => {
  const bad = ['không phải ngày', '', '2025-13-45T00:00:00Z', undefined, NaN, {}];
  for (const dt of bad) {
    const orders = [o(1, 'a', 'A', 1, 10, '2025-01-01T00:00:00Z'), o(2, 'a', 'A', 1, 10, dt)];
    for (const opt of [undefined, { from: '2025-01' }]) {
      let e1, e2;
      try { legacy(orders, P, opt); } catch (e) { e1 = e; }
      try { buildReport(orders, P, opt); } catch (e) { e2 = e; }
      assert.ok(e1, 'bản cũ phải ném lỗi với ' + String(dt));
      assert.ok(e2, 'bản mới phải ném lỗi với ' + String(dt));
      assert.equal(e2.constructor, e1.constructor);
      assert.equal(e2.name, e1.name);
      assert.equal(e2.message, e1.message);
    }
  }
});

test('input không bị mutate (đóng băng sâu)', () => {
  const d = generate({ orders: 500, products: 30, customers: 20, seed: 7 });
  const orders = deepFreeze(clone(d.orders));
  const products = deepFreeze(clone(d.products));
  const options = deepFreeze({ topN: 2, from: '2025-02' });
  const snap = JSON.stringify([orders, products, options]);
  const r = buildReport(orders, products, options);
  assert.equal(JSON.stringify([orders, products, options]), snap);
  assert.deepStrictEqual(r, legacy(orders, products, options));
  assert.ok(!Object.isFrozen(r));
});

test('fuzz nhỏ có seed: giá trị biên trộn lẫn', () => {
  const r = rng(12345);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const dates = ['2024-01-31T23:30:00-05:00', '2024-02-29T12:00:00Z', '2024-03-01T05:00:00+07:00', '2025-12-31T23:59:59Z', '2025-01-01T00:00:00+07:00'];
  for (let iter = 0; iter < 40; iter++) {
    const prods = [];
    for (let i = 0; i < 1 + Math.floor(r() * 6); i++) prods.push({ sku: pick(['a', 'b', 'c', 'd', 'e', 'f']), name: 'n' + i, category: pick(['K1', 'K2', 'K3']) });
    const orders = [];
    for (let i = 0; i < Math.floor(r() * 60); i++) {
      orders.push(o(pick([1, '1', 2, 'x', 'y', 3]), pick([1, '1', 'c', 'd', 2, 'e']), pick(['a', 'b', 'c', 'd', 'e', 'f', 'g']), pick([0, 1, 2, 3, 5]), pick([0, 100, 100, 250, -50]), pick(dates), pick(['paid', 'paid', 'refunded', 'cancelled'])));
    }
    same(orders, prods, pick([undefined, { topN: 0 }, { topN: 1 }, { topN: 2 }, { from: '2024-02' }, { to: '2024-02', topN: 5 }, { from: '2025-01', to: '2024-01' }]), 'iter ' + iter);
  }
});

test('hiệu năng: 200.000 dòng < 1000ms', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 1 });
  const t0 = process.hrtime.bigint();
  buildReport(d.orders, d.products);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1000, `mất ${ms.toFixed(0)}ms`);
});
