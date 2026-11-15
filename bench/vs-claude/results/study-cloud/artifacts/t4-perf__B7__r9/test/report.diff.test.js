'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const legacy = require('./report.legacy');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const nProd = Math.floor(r() * 12);
  const cats = ['A', 'B', 'C', 'D'];
  const products = [];
  for (let i = 0; i < nProd; i++) {
    products.push({ sku: 'S' + Math.floor(r() * 8), name: 'P' + i, category: pick(cats) });
  }
  const n = Math.floor(r() * 301);
  const prices = [0, 1, 99, 100, 250, 1999, 12.5, 0.1, -50, 100000];
  const qtys = [0, 1, 1, 2, 3, 5, -1, -2, 10];
  const orders = [];
  for (let i = 0; i < n; i++) {
    const y = pick([2023, 2024, 2025]);
    const mo = 1 + Math.floor(r() * 12);
    const d = 1 + Math.floor(r() * 28);
    const date = pick([
      new Date(Date.UTC(y, mo - 1, d, Math.floor(r() * 24))).toISOString(),
      `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T23:30:00-05:00`,
      `${y}-${String(mo).padStart(2, '0')}-01T00:00:00+07:00`,
    ]);
    orders.push({
      id: 'O' + Math.floor(r() * 60),
      customerId: 'C' + Math.floor(r() * 15),
      sku: r() < 0.15 ? 'X' + Math.floor(r() * 3) : 'S' + Math.floor(r() * 8),
      qty: pick(qtys),
      unitPrice: pick(prices),
      date,
      status: pick(['paid', 'paid', 'paid', 'refunded', 'cancelled']),
    });
  }
  const mm = () => `${pick([2023, 2024, 2025])}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`;
  const opts = [
    {},
    { topN: 0 },
    { topN: 1 },
    { topN: 5 },
    { topN: 100 },
    { from: mm() },
    { to: mm() },
    { from: mm(), to: mm() },
    { topN: 2, from: '2024-03', to: '2024-09' },
  ];
  return { orders, products, opts };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

test('fuzz: kết quả và chuỗi JSON giống bản cũ', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const { orders, products, opts } = gen(seed);
    for (const o of opts) {
      const a = buildReport(orders, products, o);
      const b = legacy.buildReport(orders, products, o);
      const ctx = `seed=${seed} opts=${JSON.stringify(o)}`;
      assert.deepStrictEqual(a, b, ctx);
      assert.strictEqual(JSON.stringify(a), JSON.stringify(b), ctx);
    }
  }
});

test('ca biên: rỗng, toàn cancelled, sku lạ, qty âm, -0', () => {
  const base = { id: 'O1', customerId: 'C1', sku: 'S1', qty: 1, unitPrice: 100, date: '2024-05-10T10:00:00Z', status: 'paid' };
  const products = [
    { sku: 'S1', name: 'Một', category: 'A' },
    { sku: 'S1', name: 'Trùng', category: 'B' },
  ];
  const cases = [
    [[], []],
    [[], products],
    [[{ ...base, status: 'cancelled' }], products],
    [[{ ...base, sku: 'ZZ' }], products],
    [[{ ...base, qty: -2 }], products],
    [[{ ...base, qty: 0 }], products],
    [[{ ...base, qty: 0, status: 'refunded' }], products],
    [[{ ...base, unitPrice: 0, status: 'refunded' }], products],
    [[{ ...base, unitPrice: 0.5, qty: 3 }, { ...base, id: 'O2', status: 'refunded' }], products],
    [[{ ...base, qty: -1 }, { ...base, id: 'O2', qty: -1, status: 'refunded' }], products],
    [[{ ...base, date: '2024-01-31T23:59:59-05:00' }, { ...base, date: '2024-12-31T23:59:59Z' }], products],
  ];
  for (const [orders, prods] of cases) {
    for (const o of [{}, { topN: 0 }, { topN: 10 }, { from: '2024-02', to: '2024-12' }, { from: '2025-01' }]) {
      const a = buildReport(orders, prods, o);
      const b = legacy.buildReport(orders, prods, o);
      assert.deepStrictEqual(a, b);
      assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
    }
  }
});

test('ngày không hợp lệ: cả hai cùng ném cùng loại lỗi', () => {
  const base = { id: 'O1', customerId: 'C1', sku: 'S1', qty: 1, unitPrice: 100, status: 'paid' };
  for (const date of ['không phải ngày', '', '2024-13-45', undefined]) {
    const orders = [{ ...base, date: '2024-05-10T10:00:00Z' }, { ...base, date }];
    for (const o of [{}, { from: '2030-01' }, { to: '2000-01' }]) {
      let ea, eb;
      try { buildReport(orders, [], o); } catch (e) { ea = e; }
      try { legacy.buildReport(orders, [], o); } catch (e) { eb = e; }
      assert.ok(eb, 'bản cũ phải ném lỗi');
      assert.ok(ea, `bản mới phải ném lỗi (date=${date}, opts=${JSON.stringify(o)})`);
      assert.strictEqual(ea.constructor, eb.constructor);
      assert.strictEqual(ea.message, eb.message);
    }
  }
});

test('đầu vào không bị sửa', () => {
  for (let seed = 500; seed < 520; seed++) {
    const { orders, products, opts } = gen(seed);
    const snap = JSON.stringify([orders, products, opts]);
    deepFreeze(orders);
    deepFreeze(products);
    for (const o of opts) {
      deepFreeze(o);
      buildReport(orders, products, o); // strict mode: ghi vào object đóng băng sẽ ném lỗi
    }
    assert.strictEqual(JSON.stringify([orders, products, opts]), snap);
  }
});
