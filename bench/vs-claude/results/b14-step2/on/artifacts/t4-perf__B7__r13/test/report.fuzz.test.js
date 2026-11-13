'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản cũ (test/report.legacy.js), seed cố định.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

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

// chạy một hàm, trả về kết quả hoặc (loại lỗi, thông điệp)
function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

function same(orders, products, options, label) {
  const a = run(() => buildReport(orders, products, options));
  const b = run(() => legacy.buildReport(orders, products, options));
  assert.equal(a.ok, b.ok, `${label}: một bản ném lỗi, bản kia không`);
  if (a.ok) assert.deepStrictEqual(a.value, b.value, label);
  else assert.deepStrictEqual({ name: a.name, message: a.message }, { name: b.name, message: b.message }, label);
  return b;
}

const WEIRD_NUM = [NaN, Infinity, -Infinity, -0, 0, '3', '', null, undefined, '2.5', 1e21, -7];
const DATES = [
  '2025-01-31T23:30:00-05:00', '2025-02-01T00:00:00+07:00', '2025-02-01T00:00:00Z', '2025-01-31T23:59:59.999Z',
  '2025-03-01T00:00:00+14:00', '2024-12-31T23:00:00-10:00', '2025-02-28T23:59:59Z', '2025-12-31T23:59:59-12:00',
  '2025-06-15T12:00:00Z', '2025-06-15T12:00:00Z', 1750000000000, '2025-07-01',
];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
const OPTS = [
  {}, { topN: 0 }, { topN: 1 }, { topN: 1000 }, { topN: null }, { topN: undefined },
  { from: '2025-02' }, { to: '2025-02' }, { from: '2025-02', to: '2025-02' },
  { from: '2025-06', to: '2025-01' }, // khoảng rỗng
  { from: '2030-01' }, { to: '2000-01' }, { from: '', to: '' }, { topN: 2, from: '2025-01', to: '2025-12' },
];

function genData(r, n, weird) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const nSku = 1 + Math.floor(r() * 8);
  const products = [];
  for (let i = 0; i < nSku; i++) {
    const p = { sku: 'S' + i, name: 'N' + i, category: 'C' + Math.floor(r() * 3) };
    if (r() < 0.2) delete p.name;
    products.push(p);
    if (r() < 0.25) products.push({ sku: 'S' + i, name: 'Dup' + i, category: 'C' + Math.floor(r() * 3) }); // sku trùng
  }
  const orders = [];
  for (let i = 0; i < n; i++) {
    const lines = 1 + Math.floor(r() * 3); // đơn nhiều dòng
    const id = 'o' + Math.floor(r() * n);
    const customerId = 'c' + Math.floor(r() * 6);
    const date = pick(DATES.slice(0, 10));
    const status = pick(STATUSES);
    for (let k = 0; k < lines; k++) {
      const o = {
        id, customerId,
        sku: r() < 0.15 ? 'UNKNOWN' + Math.floor(r() * 2) : 'S' + Math.floor(r() * nSku),
        qty: Math.floor(r() * 5),
        unitPrice: Math.floor(r() * 3000),
        date: r() < 0.1 ? pick(DATES) : date,
        status: r() < 0.3 ? pick(STATUSES) : status,
      };
      if (weird) {
        if (r() < 0.2) o.qty = pick(WEIRD_NUM);
        if (r() < 0.2) o.unitPrice = pick(WEIRD_NUM);
      }
      orders.push(o);
    }
  }
  return { orders, products };
}

test('fuzz: dữ liệu hợp lệ, nhiều tùy chọn', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed);
    const { orders, products } = genData(r, 5 + Math.floor(r() * 60), false);
    for (const o of OPTS) same(orders, products, o, `seed=${seed} opts=${JSON.stringify(o)}`);
  }
});

test('fuzz: qty/unitPrice NaN, Infinity, -0, chuỗi số, null, undefined', () => {
  for (let seed = 100; seed < 160; seed++) {
    const r = rng(seed);
    const { orders, products } = genData(r, 5 + Math.floor(r() * 40), true);
    for (const o of OPTS) same(orders, products, o, `seed=${seed} opts=${JSON.stringify(o)}`);
  }
});

test('fuzz: mọi cặp qty × unitPrice kỳ lạ, mọi status', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'B', category: 'Y' }];
  for (const status of ['paid', 'refunded', 'cancelled']) {
    for (const qty of WEIRD_NUM) {
      for (const unitPrice of WEIRD_NUM) {
        const orders = [
          { id: '1', customerId: 'c', sku: 'A', qty, unitPrice, date: '2025-01-01T00:00:00Z', status },
          { id: '1', customerId: 'c', sku: 'A', qty: 2, unitPrice: 5, date: '2025-01-01T00:00:00Z', status: 'paid' },
          { id: '2', customerId: 'd', sku: 'B', qty, unitPrice, date: '2025-02-01T00:00:00Z', status },
        ];
        same(orders, products, {}, `status=${status} qty=${String(qty)} price=${String(unitPrice)}`);
      }
    }
  }
});

test('fuzz: sku/customerId/id kỳ lạ (NaN, số, null, thiếu trường)', () => {
  const products = [
    { sku: 1, name: 'một', category: 'X' }, { sku: '1', name: 'chuỗi', category: 'Y' },
    { sku: null, name: 'null', category: 'Z' }, { sku: 'A', name: 'a' }, { sku: 'B', name: 'b', category: null },
  ];
  const skus = [1, '1', null, undefined, NaN, 'A', 'B', 'ZZ', 0, -0];
  const r = rng(777);
  for (let t = 0; t < 30; t++) {
    const orders = [];
    for (let i = 0; i < 12; i++) {
      orders.push({
        id: [1, '1', null, 'x'][Math.floor(r() * 4)], customerId: [1, '1', null, 'c', 'd'][Math.floor(r() * 5)],
        sku: skus[Math.floor(r() * skus.length)], qty: Math.floor(r() * 4), unitPrice: 100 * Math.floor(r() * 4),
        date: DATES[Math.floor(r() * 10)], status: STATUSES[Math.floor(r() * 5)],
      });
    }
    same(orders, products, {}, `t=${t}`);
    same(orders, products, { topN: 1 }, `t=${t} topN=1`);
  }
});

test('ranh giới ngày/tháng theo múi giờ với from/to', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const orders = DATES.slice(0, 10).map((date, i) => ({ id: 'o' + i, customerId: 'c' + (i % 3), sku: 'A', qty: 1 + i, unitPrice: 100, date, status: 'paid' }));
  for (const from of [undefined, '2024-12', '2025-01', '2025-02', '2025-03']) {
    for (const to of [undefined, '2025-01', '2025-02', '2025-03', '2025-12']) same(orders, products, { from, to }, `from=${from} to=${to}`);
  }
});

test('danh sách rỗng, toàn đơn huỷ, products rỗng', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  for (const o of OPTS) {
    same([], products, o, 'orders rỗng');
    same([], [], o, 'cả hai rỗng');
    same([{ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date: '2025-01-01T00:00:00Z', status: 'cancelled' }], products, o, 'toàn huỷ');
    same([{ id: '1', customerId: 'c', sku: 'A', qty: 2, unitPrice: 9, date: '2025-01-01T00:00:00Z', status: 'paid' }], [], o, 'products rỗng');
  }
});

test('ngày sai: cả hai bản ném cùng loại lỗi', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const mk = (date, status = 'paid') => ({ id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 1, date, status });
  for (const bad of ['bad', '', 'not-a-date', '2025-13-45', NaN, undefined, null === 0 ? 0 : 'Invalid Date', {}]) {
    for (const status of ['paid', 'cancelled']) {
      for (const pos of [0, 1]) {
        const orders = pos === 0 ? [mk(bad, status), mk('2025-01-01T00:00:00Z')] : [mk('2025-01-01T00:00:00Z'), mk(bad, status)];
        for (const o of [{}, { from: '2030-01' }]) {
          const b = same(orders, products, o, `bad=${String(bad)} status=${status} pos=${pos}`);
          if (!b.ok) assert.equal(b.name, 'RangeError');
        }
      }
    }
  }
});
