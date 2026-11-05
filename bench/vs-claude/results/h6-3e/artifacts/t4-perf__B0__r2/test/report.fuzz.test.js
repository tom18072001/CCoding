'use strict';
// Fuzz / ca biên: so sánh buildReport (bản mới) với bản cũ (test/report.legacy.js) bằng seed cố định.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildReport } = require(path.join(__dirname, '..', 'src', 'report'));
const legacy = require('./report.legacy');

assert.equal(typeof buildReport, 'function');
assert.equal(typeof legacy.buildReport, 'function');

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

function run(fn, o, p, opt) {
  try { return { ok: fn(o, p, opt) }; } catch (e) { return { err: e.constructor.name + ':' + e.message }; }
}

function same(orders, products, opts, label) {
  const before = JSON.stringify([orders, products]);
  const a = run(buildReport, orders, products, opts);
  const b = run(legacy.buildReport, orders, products, opts);
  assert.deepStrictEqual(a, b, label);
  if (a.ok) assert.equal(JSON.stringify(a.ok), JSON.stringify(b.ok), label + ' (thứ tự khóa)');
  assert.equal(JSON.stringify([orders, products]), before, label + ' (đầu vào bị sửa)');
}

const ZONES = ['Z', '+07:00', '-08:00', '+14:00', '-12:00', '+05:30', '+00:00'];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'pending', undefined];
const ODD_NUM = [0, -1, -3, 0.5, 2.25, NaN, undefined, 1e6, -0];

function genData(seed, n, { weird }) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const cats = ['A', 'B', 'C', 'Đồ uống', 'Z'];
  const products = [];
  for (let i = 0; i < 25; i++) {
    const p = { sku: 'S' + i, name: 'N' + i, category: pick(cats) };
    if (r() < 0.15) delete p.category;
    products.push(p);
  }
  for (let i = 0; i < 5; i++) products.push({ sku: 'S' + i, name: 'DUP' + i, category: pick(cats) }); // sku trùng
  const orders = [];
  for (let i = 0; i < n; i++) {
    const y = 2024 + Math.floor(r() * 2);
    const mo = pick([1, 2, 3, 11, 12, 12, 1]);
    const day = pick([1, 1, 28, 29, 30, 31].filter((d) => mo !== 2 || d <= 28 || (y === 2024 && d === 29)));
    const hh = String(Math.floor(r() * 24)).padStart(2, '0');
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hh}:30:00${pick(ZONES)}`;
    const o = {
      id: 'o' + Math.floor(r() * n * 0.6),
      customerId: 'c' + Math.floor(r() * 30),
      sku: r() < 0.1 ? 'MISSING' + Math.floor(r() * 3) : 'S' + Math.floor(r() * 25),
      qty: 1 + Math.floor(r() * 4),
      unitPrice: pick([100, 100, 250, 500, 500, 1000]), // nhiều giá trị hòa nhau
      date,
      status: pick(STATUSES),
    };
    if (weird) {
      if (r() < 0.05) o.qty = pick(ODD_NUM);
      if (r() < 0.05) o.unitPrice = pick(ODD_NUM);
      if (r() < 0.03) o.date = Date.UTC(y, mo - 1, day, 12);
      if (r() < 0.02) o.date = new Date(Date.UTC(y, mo - 1, day)).toISOString();
      if (r() < 0.02) o.sku = null;
      if (r() < 0.02) o.customerId = undefined;
    }
    orders.push(o);
  }
  return { orders, products };
}

const OPTS = [
  undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 10 },
  { from: '2024-12' }, { to: '2025-01' }, { from: '2024-12', to: '2025-01' },
  { from: '2025-01', to: '2024-12' }, { from: '2030-01' }, { to: '2000-01' },
  { topN: 1, from: '2024-11', to: '2025-12' }, { from: '', to: '' }, { topN: null },
];

test('fuzz sạch: nhiều múi giờ, ranh giới tháng, sku trùng/thiếu, hòa doanh thu', () => {
  for (const seed of [11, 22, 33]) {
    const { orders, products } = genData(seed, 1500, { weird: false });
    OPTS.forEach((o, i) => same(orders, products, o, `seed ${seed} opts#${i}`));
  }
});

test('fuzz lạ: qty/unitPrice 0/âm/thập phân/NaN/undefined, date số, sku null', () => {
  for (const seed of [101, 202, 303, 404]) {
    const { orders, products } = genData(seed, 1000, { weird: true });
    OPTS.forEach((o, i) => same(orders, products, o, `seed ${seed} opts#${i}`));
  }
});

test('ca biên cố định', () => {
  const P = [{ sku: 'A', name: 'a', category: 'X' }];
  const L = (o) => ({ id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-31T23:59:59Z', status: 'paid', ...o });
  same([], [], undefined, 'rỗng');
  same([], P, { topN: 5 }, 'rỗng có products');
  same([L({ date: '2025-01-31T23:59:59-01:00' })], P, undefined, 'lệch sang tháng sau');
  same([L({ date: '2025-02-01T00:30:00+01:00' })], P, undefined, 'lệch về tháng trước');
  same([L({ date: '2024-12-31T20:00:00-05:00' })], P, { from: '2025-01' }, 'qua năm');
  same([L({ qty: 0 }), L({ id: 'p', qty: 0, sku: 'Q' })], P, undefined, 'tổng 0');
  same([L({ qty: 1 }), L({ status: 'refunded' })], P, undefined, 'tổng triệt tiêu');
  same([L({ sku: 'B' }), L({ sku: 'A', id: 'x' })], P, undefined, 'hòa doanh thu khác sku');
  same([L({ sku: NaN }), L({ sku: undefined })], P, undefined, 'sku NaN/undefined');
  same([L({ qty: NaN }), L({ unitPrice: Infinity, id: 'q' })], P, undefined, 'NaN/Infinity');
  same([L({ date: 'không phải ngày' })], P, undefined, 'date sai');
  same([L({ date: 1735689600000 }), L({ date: undefined, id: 'z' })], P, undefined, 'date số/undefined');
  same([L({ status: 'paid' }), L({ status: 'PAID' })], P, { topN: 0 }, 'status lạ');
  same([L()], [{ sku: 'A', name: 'a' }, { sku: 'A', name: 'b', category: 'Y' }], undefined, 'thiếu category + sku trùng');
});
