'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./fixtures/report.legacy');
const { generate, rng } = require('../src/gen');

function same(orders, products, options, label) {
  const a = buildReport(orders, products, options);
  const b = legacy(orders, products, options);
  assert.deepStrictEqual(a, b, label);
  assert.equal(JSON.stringify(a), JSON.stringify(b), `${label} (thứ tự khóa)`);
}

const DATES = [
  '2024-12-31T23:59:59Z', '2025-01-01T00:00:00Z', '2025-01-31T23:59:59.999Z', '2025-02-01T00:00:00Z',
  '2025-01-31T23:30:00-05:00', '2025-02-01T00:00:00+07:00', '2025-02-28T23:59:59Z', '2025-03-01T00:00:00+14:00',
  '2025-06-30T23:59:59Z', '2025-07-01T00:00:00-12:00', '2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
  '2026-01-01T06:00:00+07:00', '2024-02-29T12:00:00Z',
];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled', 'weird'];
const MONTHS = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-06', '2025-07', '2025-12', '2026-01', '2030-01'];

function fuzzData(seed, n) {
  const r = rng(seed * 7919 + 13);
  const pick = (k) => Math.floor(r() * k);
  const cats = ['A', 'B', 'C', 'Đồ uống', undefined];
  const products = [];
  const np = 3 + pick(25);
  for (let i = 0; i < np; i++) {
    const p = { sku: `S${pick(np)}`, name: `N${i}` }; // sku trùng
    const c = cats[pick(cats.length)];
    if (c !== undefined) p.category = c;
    products.push(p);
  }
  const nc = 1 + pick(30);
  const orders = [];
  for (let i = 0; i < n; i++) {
    const kind = pick(10);
    const qty = kind === 0 ? 0 : kind === 1 ? -pick(4) : kind === 2 ? pick(9) + 0.5 : 1 + pick(6);
    const k2 = pick(10);
    const unitPrice = k2 === 0 ? 0 : k2 === 1 ? -100 * pick(5) : k2 === 2 ? pick(1000) / 7 : k2 === 3 ? 0.1 * pick(10) : 100 * pick(30);
    orders.push({
      id: `O${pick(Math.max(1, n >> 1))}`,
      customerId: `C${pick(nc)}`,
      sku: pick(12) === 0 ? `GONE${pick(5)}` : `S${pick(np)}`, // sku không rõ
      qty,
      unitPrice,
      date: DATES[pick(DATES.length)],
      status: STATUSES[pick(STATUSES.length)],
    });
  }
  return { orders, products };
}

function optionSets(seed) {
  const r = rng(seed + 99);
  const pick = (k) => Math.floor(r() * k);
  const sets = [{}, { topN: 0 }, { topN: 1 }, { topN: 100 }];
  for (let i = 0; i < 6; i++) {
    const o = {};
    if (pick(2)) o.from = MONTHS[pick(MONTHS.length)];
    if (pick(2)) o.to = MONTHS[pick(MONTHS.length)];
    if (pick(2)) o.topN = pick(6);
    sets.push(o);
  }
  return sets;
}

test('fuzz: dữ liệu hỗn hợp (status, sku trùng/không rõ, category thiếu, qty=0, âm, lẻ, biên tháng/năm)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const n = [0, 1, 5, 50, 300, 1200, 3000][seed % 7];
    const d = fuzzData(seed, n);
    for (const o of optionSets(seed)) same(d.orders, d.products, o, `seed=${seed} n=${n} opts=${JSON.stringify(o)}`);
  }
});

test('fuzz: dữ liệu sinh bởi generate() với nhiều tổ hợp from/to/topN', () => {
  for (let seed = 100; seed < 106; seed++) {
    const d = generate({ orders: 2500, products: 30 + seed, customers: 80, seed });
    for (const from of [undefined, '2025-01', '2025-05']) {
      for (const to of [undefined, '2025-06', '2025-12']) {
        for (const topN of [undefined, 0, 2, 7]) {
          const o = {};
          if (from) o.from = from;
          if (to) o.to = to;
          if (topN !== undefined) o.topN = topN;
          same(d.orders, d.products, o, `gen seed=${seed} opts=${JSON.stringify(o)}`);
        }
      }
    }
  }
});

test('thời gian: bản mới < 3 giây trên 200.000 dòng', () => {
  const d = generate({ orders: 200000, products: 2000, customers: 3000, seed: 42 });
  const t0 = process.hrtime.bigint();
  const rep = buildReport(d.orders, d.products, { topN: 5 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(rep.months.length > 0);
  assert.ok(ms < 3000, `mất ${ms.toFixed(0)} ms`);
});
