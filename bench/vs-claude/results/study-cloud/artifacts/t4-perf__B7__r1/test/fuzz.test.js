'use strict';
// Fuzz đối chiếu buildReport (src/report.js) với bản cũ (test/fixtures/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;
const { rng } = require('../src/gen');

const CATS = ['A', 'B', 'C', 'Đồ uống', 'Sách', 'Z'];
const DATES = [
  '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-02-01T00:00:00+07:00', '2025-01-31T23:30:00-05:00',
  '2025-02-28T23:59:59.999Z', '2025-03-01T00:00:00+14:00', '2025-12-31T23:59:59-12:00', '2026-01-01T00:00:00Z',
  '2025-06-15T12:00:00Z', '2025-07-01T06:00:00+07:00', '2024-02-29T10:00:00Z', '2025-04-30T20:00:00-07:00',
];
const OPTS = [{}, { topN: 1 }, { topN: 2 }, { topN: 5 }, { topN: 0 }, { topN: 100 }, { from: '2025-02' }, { to: '2025-06' },
  { from: '2025-02', to: '2025-02' }, { from: '2025-03', to: '2025-01' }, { from: '2024-01', to: '2026-12', topN: 4 }, { from: '2030-01' }];

function make(seed, size, profile) {
  const r = rng(seed * 7919 + 13);
  const pick = (n) => Math.floor(r() * n);
  const nProd = 1 + pick(profile.manyProducts ? 60 : 6);
  const products = [];
  for (let i = 0; i < nProd; i++) products.push({ sku: `S${i}`, name: `N${i}`, category: CATS[pick(CATS.length)] });
  if (profile.dupSku) for (let i = 0; i < 4; i++) products.push({ sku: `S${pick(nProd)}`, name: `D${i}`, category: CATS[pick(CATS.length)] });
  const nCust = 1 + pick(profile.fewCustomers ? 4 : 80);
  const orders = [];
  let id = 0;
  while (orders.length < size) {
    id++;
    const customerId = `C${pick(nCust)}`;
    const date = profile.dates ? DATES[pick(DATES.length)] : DATES[8];
    const roll = r();
    const status = roll < 1 - profile.refund - profile.cancel ? 'paid' : roll < 1 - profile.cancel ? 'refunded' : 'cancelled';
    const lines = 1 + pick(4);
    for (let l = 0; l < lines && orders.length < size; l++) {
      const missing = r() < profile.missing;
      const sku = missing ? `GONE${pick(5)}` : `S${pick(nProd)}`;
      const qty = r() < profile.zeroQty ? 0 : 1 + pick(5);
      let unitPrice = profile.ties ? 100 * (1 + pick(2)) : 1 + pick(5000);
      if (profile.float) unitPrice = Math.round(r() * 1e5) / 100 + 0.1;
      if (profile.negative && r() < 0.2) unitPrice = -unitPrice;
      orders.push({
        id: `O${id}`, customerId, sku,
        qty: profile.float ? qty + (r() < 0.3 ? 0.5 : 0) : qty,
        unitPrice,
        date: profile.mixDates && r() < 0.5 ? DATES[pick(DATES.length)] : date,
        status,
      });
    }
  }
  return { orders, products };
}

const base = { refund: 0.1, cancel: 0.05, missing: 0.02, zeroQty: 0, dupSku: false, dates: true };
const profiles = [
  ['mặc định', {}],
  ['nhiều hoàn/hủy', { refund: 0.4, cancel: 0.3 }],
  ['toàn hoàn', { refund: 1, cancel: 0 }],
  ['toàn hủy', { refund: 0, cancel: 1 }],
  ['qty=0', { zeroQty: 0.3, refund: 0.3 }],
  ['amount âm', { negative: true, refund: 0.3 }],
  ['số thực lẻ', { float: true }],
  ['sku trùng', { dupSku: true, manyProducts: true }],
  ['sku thiếu nhiều', { missing: 0.6 }],
  ['khách lặp', { fewCustomers: true }],
  ['hòa điểm', { ties: true, fewCustomers: true, refund: 0.05, cancel: 0 }],
  ['hòa điểm + sku trùng', { ties: true, dupSku: true }],
  ['một ngày', { dates: false }],
  ['ngày hỗn hợp', { mixDates: true, dates: true, refund: 0.3 }],
];

let n = 0;
for (const [name, p] of profiles) {
  for (const size of [1, 37, 400, 1500]) {
    for (const seed of [1, 2]) {
      const s = ++n;
      test(`fuzz #${s} ${name}, ${size} dòng, seed ${seed}`, () => {
        const d = make(s, size, { ...base, ...p });
        for (const o of OPTS) {
          assert.deepStrictEqual(buildReport(d.orders, d.products, o), legacy(d.orders, d.products, o), `options=${JSON.stringify(o)}`);
        }
      });
    }
  }
}

test('fuzz: mảng rỗng và products rỗng', () => {
  const one = [{ sku: 'a', name: 'n', category: 'c' }];
  for (const o of OPTS) {
    assert.deepStrictEqual(buildReport([], [], o), legacy([], [], o));
    assert.deepStrictEqual(buildReport([], one, o), legacy([], one, o));
  }
  const d = make(5, 200, base);
  assert.deepStrictEqual(buildReport(d.orders, [], {}), legacy(d.orders, [], {}));
});
