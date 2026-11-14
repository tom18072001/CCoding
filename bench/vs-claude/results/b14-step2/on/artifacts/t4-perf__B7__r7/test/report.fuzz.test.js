'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản cũ (test/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

// PRNG mulberry32 có seed
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05'];
const STATUSES = ['paid', 'refunded', 'cancelled', 'paid', 'paid', 'refunded', 'PAID', 'Cancelled', 'weird', '', undefined, null];

function genCase(seed, size) {
  const r = prng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (n) => Math.floor(r() * n);

  const nProd = int(15);
  const cats = ['X', 'Y', 'Z', 'a', 'B', '', null, undefined, 'x y'];
  const products = [];
  for (let i = 0; i < nProd; i++) {
    const p = { sku: 'S' + int(Math.max(1, nProd)), name: 'N' + int(5) };
    const c = pick(cats);
    if (c !== undefined || r() < 0.5) p.category = c;
    if (r() < 0.1) delete p.name;
    products.push(p);
  }
  const skus = ['S0', 'S1', 'S2', 'S3', 'S5', 'S9', 'S14', 'NOPE', 'S01'];
  const edgeDays = ['01T00:00:00.000Z', '28T23:59:59.999Z', '31T23:59:59Z', '01T00:00:00+07:00', '15T12:00:00-05:00', '01T03:00:00+07:00', '28T23:00:00-02:00'];
  const qtys = [0, 0, 1, 2, 3, 5, -1, -2, 1.5, 0.1, 2.25, 10];
  const prices = [0, 100, 250, 1999, 0.1, 0.2, 0.3, 333.33, 12.5, 1e6, -50];
  const orders = [];
  for (let i = 0; i < size; i++) {
    const m = pick(MONTHS);
    const o = {
      id: 'o' + int(Math.max(1, size >> 2) + 1),
      customerId: r() < 0.03 ? null : 'c' + int(30),
      sku: pick(skus),
      qty: pick(qtys),
      unitPrice: pick(prices),
      date: `${m}-${pick(edgeDays)}`,
      status: pick(STATUSES),
    };
    if (r() < 0.02) o.extra = { nested: [1, 2, i] };
    orders.push(o);
  }
  return { orders, products };
}

function optionsFor(r) {
  const pickm = () => MONTHS[Math.floor(r() * MONTHS.length)];
  const list = [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 10 }, { topN: null }, { topN: undefined }];
  for (let i = 0; i < 4; i++) list.push({ from: pickm() });
  for (let i = 0; i < 4; i++) list.push({ to: pickm() });
  for (let i = 0; i < 6; i++) list.push({ from: pickm(), to: pickm(), topN: Math.floor(r() * 5) });
  list.push({ from: '2025-02', to: '2025-02' }, { from: '2030-01' }, { to: '1999-01' }, { from: '', to: '' });
  return list;
}

function run(fn, orders, products, opts) {
  try {
    return { ok: true, v: fn(orders, products, opts) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, msg: e && e.message };
  }
}

function compare(orders, products, opts, label) {
  const before = JSON.stringify([orders, products]);
  const a = run(buildReport, orders, products, opts);
  const b = run(legacy.buildReport, orders, products, opts);
  assert.equal(JSON.stringify([orders, products]), before, `${label}: đầu vào bị sửa`);
  assert.equal(a.ok, b.ok, `${label}: khác nhau về ném lỗi`);
  if (!b.ok) {
    assert.equal(a.name, b.name, `${label}: khác loại lỗi`);
    return;
  }
  assert.deepStrictEqual(a.v, b.v, `${label}: kết quả lệch (opts=${JSON.stringify(opts)})`);
  assert.equal(JSON.stringify(a.v), JSON.stringify(b.v), `${label}: thứ tự khóa lệch`);
}

test('fuzz: nhiều seed, quy mô 0..vài nghìn dòng, nhiều tổ hợp option', () => {
  const sizes = [0, 1, 2, 5, 20, 100, 400, 1500];
  let n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const size = sizes[seed % sizes.length];
    const { orders, products } = genCase(seed * 7919, size);
    const opts = optionsFor(prng(seed));
    // giảm số tổ hợp với dữ liệu lớn để giữ thời gian chạy
    const use = size >= 1500 ? opts.slice(0, 8) : opts;
    for (const o of use) {
      compare(orders, products, o, `seed=${seed} size=${size}`);
      n++;
    }
  }
  assert.ok(n > 300);
});

test('fuzz: vài nghìn dòng', () => {
  for (const seed of [101, 202]) {
    const { orders, products } = genCase(seed, 3000);
    for (const o of [undefined, { topN: 5, from: '2025-01', to: '2025-04' }]) compare(orders, products, o, `big seed=${seed}`);
  }
});

test('fuzz: mảng rỗng và không có product', () => {
  compare([], [], undefined, 'empty');
  compare([], [{ sku: 'A', name: 'A', category: 'X' }], { from: '2025-01' }, 'empty orders');
  const { orders } = genCase(5, 200);
  compare(orders, [], undefined, 'no products');
  compare(orders, [], { topN: 0 }, 'no products topN0');
});

test('fuzz: ngày sai — cả hai cùng ném cùng loại lỗi', () => {
  const { orders, products } = genCase(9, 30);
  const bad = orders.slice();
  bad[10] = { ...bad[10], date: 'not-a-date' };
  compare(bad, products, undefined, 'bad date');
  compare(bad, products, { from: '2025-01' }, 'bad date from');
});
