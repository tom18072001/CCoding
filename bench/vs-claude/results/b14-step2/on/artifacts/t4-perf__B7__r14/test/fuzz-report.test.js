'use strict';
// Fuzz so sánh buildReport (src/report.js) với bản gốc (test/legacy-report.js).
// PRNG seed cố định → tái lập được. Bản gốc là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: legacy } = require('./legacy-report');
const { rng } = require('../src/gen');

const CATS = ['Đồ uống', 'Sách', 'Gia dụng', 'Điện tử', 'a', 'B'];
const STATUSES = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];
const TZ = ['Z', '+07:00', '-05:00', '+00:00', '+14:00', '-11:30'];
const MONTHS = ['2023-12', '2024-01', '2024-02', '2024-12', '2025-01', '2025-02', '2025-06', '2025-12', '2026-03'];

function makeCase(seed) {
  const r = rng(seed * 7919 + 13);
  const pick = (n) => Math.floor(r() * n);
  const choice = (a) => a[pick(a.length)];

  // products: có sku trùng, thiếu category
  const nProd = pick(8);
  const products = [];
  for (let i = 0; i < nProd; i++) {
    const p = { sku: `S${pick(6)}`, name: `Tên ${i}` };
    if (r() > 0.2) p.category = choice(CATS);
    products.push(p);
  }

  // mảng rỗng / một dòng / nhiều dòng
  const mode = seed % 10;
  const n = mode === 0 ? 0 : mode === 1 ? 1 : 1 + pick(60);
  const nCust = 1 + pick(6);
  const nOrd = 1 + pick(10);
  const mkDate = () => {
    const ym = choice(MONTHS);
    const d = String(1 + pick(28)).padStart(2, '0');
    const h = String(pick(24)).padStart(2, '0');
    const s = `${ym}-${d}T${h}:${String(pick(60)).padStart(2, '0')}:00${choice(TZ)}`;
    return r() < 0.25 ? new Date(s) : s;
  };
  const orders = [];
  for (let i = 0; i < n; i++) {
    orders.push({
      id: `O${pick(nOrd)}`,
      customerId: `C${pick(nCust)}`,
      sku: r() < 0.15 ? `NOPE${pick(3)}` : `S${pick(6)}`,
      qty: r() < 0.15 ? 0 : 1 + pick(5),
      unitPrice: r() < 0.1 ? 0 : 100 + pick(40) * 50,
      date: mkDate(),
      status: choice(STATUSES),
    });
  }
  // nhiều dòng giống nhau (ổn định khi sort)
  if (mode === 2 && orders.length) {
    const base = orders[0];
    for (let i = 0; i < 5; i++) orders.push({ ...base });
  }
  if (mode === 3) {
    const base = { id: 'X', customerId: 'CX', sku: 'S1', qty: 2, unitPrice: 300, date: '2025-01-10T00:00:00Z', status: 'paid' };
    for (let i = 0; i < 8; i++) orders.push({ ...base });
    products.push({ sku: 'S1', name: 'dup', category: 'Sách' });
  }

  // options
  const options = {};
  if (r() < 0.7) options.topN = choice([0, 1, 2, 3, 5, 100]);
  if (r() < 0.4) options.from = choice(MONTHS);
  if (r() < 0.4) options.to = choice(MONTHS);
  if (r() < 0.1) options.from = '';
  return { orders, products, options };
}

test('fuzz: 120 bộ dữ liệu nhỏ khớp bản gốc', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const { orders, products, options } = makeCase(seed);
    const o1 = JSON.stringify([orders, products, options]);
    const expected = legacy(orders, products, options);
    const actual = buildReport(orders, products, options);
    assert.deepStrictEqual(actual, expected, `seed=${seed} options=${JSON.stringify(options)}`);
    // key order của byMonth cũng phải khớp
    assert.deepStrictEqual(
      actual.categories.map((c) => Object.keys(c.byMonth)),
      expected.categories.map((c) => Object.keys(c.byMonth)),
      `seed=${seed} byMonth keys`
    );
    assert.equal(JSON.stringify([orders, products, options]), o1, `seed=${seed}: đầu vào bị biến đổi`);
  }
});

test('fuzz: ca biên cố định', () => {
  const P = [{ sku: 'A', name: 'a', category: 'X' }];
  const row = { id: 'o', customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-03-01T00:00:00Z', status: 'paid' };
  const cases = [
    [[], P, {}],
    [[row], P, {}],
    [[row], [], {}],
    [[row, row, row], P, { topN: 0 }],
    [[{ ...row, status: 'refunded' }, row], P, { from: '2025-03', to: '2025-03' }],
    [[row], P, { from: '2026-01' }],
    [[row], P, { to: '2024-01' }],
    [[{ ...row, qty: 0 }, { ...row, status: 'refunded', qty: 0 }], P, {}],
    [[{ ...row, date: new Date('2025-03-01T00:00:00Z') }], P, {}],
    [[{ ...row, date: '2025-03-01T00:30:00+01:00' }], P, {}],
  ];
  for (const [o, p, opt] of cases) assert.deepStrictEqual(buildReport(o, p, opt), legacy(o, p, opt));
});
