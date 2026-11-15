'use strict';
// So sánh buildReport (src/report.js) với bản cũ (test/report.legacy.js) trên dữ liệu ngẫu nhiên có seed và các ca biên.
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./report.legacy');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'pending', 'weird'];

function makeData(seed, n, opts = {}) {
  const r = rng(seed);
  const int = (k) => Math.floor(r() * k);
  const nProd = opts.products ?? 1 + int(25);
  const nCat = opts.cats ?? 1 + int(8);
  const products = [];
  for (let i = 0; i < nProd; i++) products.push({ sku: 'S' + i, name: 'P' + i, category: 'C' + int(nCat) });
  // sku trùng (bản đầu thắng, category khác)
  if (nProd > 1) products.push({ sku: 'S0', name: 'dup', category: 'CDUP' });
  const nCust = 1 + int(40);
  const years = [2023, 2024, 2025, 2026];
  const orders = [];
  for (let i = 0; i < n; i++) {
    const y = years[int(years.length)];
    const mo = 1 + int(12);
    const day = 1 + int(28);
    const tz = r() < 0.3 ? ['+07:00', '-05:00', 'Z'][int(3)] : 'Z';
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(int(24)).padStart(2, '0')}:${String(int(60)).padStart(2, '0')}:00${tz}`;
    const roll = r();
    const qty = roll < 0.08 ? 0 : roll < 0.15 ? Math.round(r() * 300) / 100 : 1 + int(9);
    const price = r() < 0.1 ? Math.round(r() * 1e6) / 100 : int(100000);
    const skuRoll = r();
    orders.push({
      id: 'o' + int(Math.max(1, n / 2)),
      customerId: 'c' + int(nCust),
      sku: skuRoll < 0.07 ? 'MISSING' + int(3) : 'S' + int(nProd),
      qty,
      unitPrice: price,
      date,
      status: STATUSES[int(STATUSES.length)],
    });
  }
  return { orders, products };
}

function clone(x) {
  return structuredClone(x);
}

function compare(orders, products, options, label) {
  const o0 = clone(orders), p0 = clone(products), opt0 = clone(options);
  const expected = legacy(orders, products, options);
  const actual = buildReport(orders, products, options);
  assert.deepStrictEqual(actual, expected, label);
  assert.deepStrictEqual(orders, o0, 'orders bị biến đổi: ' + label);
  assert.deepStrictEqual(products, p0, 'products bị biến đổi: ' + label);
  assert.deepStrictEqual(options, opt0, 'options bị biến đổi: ' + label);
}

const OPTS = [
  undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 1000 },
  { from: '2024-03' }, { to: '2024-09' }, { from: '2024-02', to: '2025-06' },
  { from: '2025-06', to: '2024-02' }, { from: '2024-05', to: '2024-05', topN: 2 },
  { from: '2030-01' }, { to: '2000-01' }, { from: '1990-01', to: '2100-12' },
  { from: '2022-01', to: '2022-12' }, { from: '', to: '' }, { topN: null }, { topN: undefined, from: undefined },
];

test('bản mới và bản cũ là hai hàm khác nhau, từ hai tệp khác nhau', () => {
  assert.notStrictEqual(buildReport, legacy);
  assert.notStrictEqual(require.resolve('../src/report'), require.resolve('./report.legacy'));
  assert.notStrictEqual(buildReport.toString(), legacy.toString());
});

test('ngẫu nhiên có seed: 30 seed × kích thước 0..vài nghìn × mọi tổ hợp option', () => {
  const sizes = [0, 1, 2, 5, 17, 60, 250, 900, 2500, 4000];
  for (let seed = 1; seed <= 30; seed++) {
    const n = sizes[seed % sizes.length];
    const { orders, products } = makeData(seed, n);
    for (const [i, o] of OPTS.entries()) {
      if (o === undefined) {
        const e = legacy(orders, products), a = buildReport(orders, products);
        assert.deepStrictEqual(a, e, `seed ${seed} n ${n} không options`);
      } else compare(orders, products, o, `seed ${seed} n ${n} opt#${i} ${JSON.stringify(o)}`);
    }
  }
});

test('đầu vào rỗng', () => {
  for (const o of OPTS) {
    compare([], [], o ?? {}, 'rỗng ' + JSON.stringify(o));
    compare([], [{ sku: 'A', name: 'a', category: 'X' }], o ?? {}, 'rỗng có sp');
  }
  const { orders } = makeData(5, 50);
  compare(orders, [], {}, 'không có products');
});

test('hoà điểm: danh mục, sản phẩm, khách hàng cùng doanh thu (tie-break sort)', () => {
  const products = [];
  for (const c of ['Z', 'a', 'B', 'b', 'A', 'z', 'Đ', 'é']) {
    for (const k of ['3', '1', '2', '10']) products.push({ sku: `${c}-${k}`, name: `n${c}${k}`, category: c });
  }
  const orders = [];
  let i = 0;
  for (const p of products) {
    for (const cust of ['c9', 'c10', 'c1', 'C1', 'c2']) {
      orders.push({ id: 'o' + i++, customerId: cust, sku: p.sku, qty: 2, unitPrice: 100, date: '2025-03-10T00:00:00Z', status: 'paid' });
    }
  }
  // cùng doanh thu nhưng qty khác nhau
  orders.push({ id: 'q1', customerId: 'cq', sku: 'Z-1', qty: 4, unitPrice: 50, date: '2025-03-10T00:00:00Z', status: 'paid' });
  orders.push({ id: 'q2', customerId: 'cq', sku: 'Z-2', qty: 1, unitPrice: 200, date: '2025-03-10T00:00:00Z', status: 'paid' });
  for (const topN of [0, 1, 3, 5, 100]) compare(orders, products, { topN }, 'tie topN ' + topN);
  // đảo thứ tự đầu vào
  compare(clone(orders).reverse(), clone(products).reverse(), { topN: 5 }, 'tie đảo ngược');
});

test('ca đặc biệt: refunded qty 0, status lạ, sku trùng/không có, âm/dương, tổng 0', () => {
  const products = [
    { sku: 'A', name: 'a1', category: 'X' },
    { sku: 'A', name: 'a2', category: 'Y' },
    { sku: 'B', name: 'b', category: 'X' },
  ];
  const d = (s) => `${s}T12:00:00Z`;
  const orders = [
    { id: '1', customerId: 'c1', sku: 'A', qty: 0, unitPrice: 10, date: d('2025-01-01'), status: 'refunded' },
    { id: '2', customerId: 'c1', sku: 'B', qty: 3, unitPrice: 10, date: d('2025-01-02'), status: 'pending' },
    { id: '3', customerId: 'c2', sku: 'NOPE', qty: 1, unitPrice: 7.5, date: d('2025-02-02'), status: 'paid' },
    { id: '4', customerId: 'c2', sku: 'B', qty: 3, unitPrice: 10, date: d('2025-02-03'), status: 'refunded' },
    { id: '5', customerId: 'c3', sku: 'B', qty: 3, unitPrice: 10, date: d('2025-02-03'), status: 'paid' },
    { id: '6', customerId: 'c3', sku: 'A', qty: 0.1, unitPrice: 0.2, date: d('2024-12-31'), status: 'paid' },
    { id: '6', customerId: 'c3', sku: 'A', qty: 0.2, unitPrice: 0.1, date: d('2024-12-31'), status: 'paid' },
    { id: '7', customerId: 'c4', sku: 'A', qty: 1, unitPrice: 0, date: '2025-03-31T23:59:59-05:00', status: 'paid' },
    { id: '8', customerId: 'c4', sku: 'A', qty: 1, unitPrice: 5, date: '2025-04-01T00:00:00+07:00', status: 'refunded' },
    { id: '9', customerId: 'c5', sku: 'A', qty: 1, unitPrice: 5, date: '2025-05-01T00:00:00Z', status: 'cancelled' },
  ];
  for (const o of OPTS) compare(orders, products, o ?? {}, 'đặc biệt ' + JSON.stringify(o));
  // chỉ có đơn hoàn → grandTotal âm; tổng bằng 0 → share 0
  const onlyRefund = orders.filter((o) => o.status === 'refunded');
  for (const o of OPTS) compare(onlyRefund, products, o ?? {}, 'chỉ hoàn');
  compare([
    { id: '1', customerId: 'a', sku: 'A', qty: 1, unitPrice: 10, date: d('2025-01-01'), status: 'paid' },
    { id: '2', customerId: 'a', sku: 'A', qty: 1, unitPrice: 10, date: d('2025-01-01'), status: 'refunded' },
  ], products, {}, 'tổng 0');
});

test('ngày không hợp lệ ném cùng loại lỗi và thông điệp', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const good = { id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'paid' };
  const bads = ['not-a-date', '', '2025-13-45T00:00:00Z', undefined, {}];
  const variants = [{}, { from: '2030-01' }, { to: '2000-01' }, { from: '2025-06', to: '2025-01' }];
  for (const bad of bads) {
    for (const status of ['paid', 'cancelled']) {
      for (const o of variants) {
        // vị trí lỗi: đầu, giữa, cuối
        const arrs = [[{ ...good, date: bad, status }], [good, { ...good, date: bad, status }, good], [good, good, { ...good, date: bad, status }]];
        for (const orders of arrs) {
          let e, a;
          try { legacy(orders, products, o); } catch (x) { e = x; }
          try { buildReport(orders, products, o); } catch (x) { a = x; }
          assert.ok(e, `bản cũ phải ném với ${String(bad)}`);
          assert.ok(a, `bản mới phải ném với ${String(bad)}`);
          assert.strictEqual(a.constructor, e.constructor);
          assert.strictEqual(a.name, e.name);
          assert.strictEqual(a.message, e.message);
        }
      }
    }
  }
});

test('ngày hợp lệ dạng khác (timestamp số, Date, chuỗi lặp lại)', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const base = { id: '1', customerId: 'c', sku: 'A', qty: 2, unitPrice: 3, status: 'paid' };
  const orders = [
    { ...base, date: 1735689600000 },
    { ...base, id: '2', date: '2025-01-01T00:00:00Z' },
    { ...base, id: '3', date: '2025-01-01T00:00:00Z' },
    { ...base, id: '4', date: '2025-01-01T00:00:00+07:00' },
    { ...base, id: '5', date: '2025-06-15' },
  ];
  for (const o of OPTS) compare(orders, products, o ?? {}, 'ngày dạng khác');
});
