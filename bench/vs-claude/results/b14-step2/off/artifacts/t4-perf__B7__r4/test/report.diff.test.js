'use strict';
// So khớp buildReport (src) với bản tham chiếu (test/report.reference.js): giá trị, thứ tự mảng, thứ tự key.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReport: ref } = require('./report.reference');
const { generate, rng } = require('../src/gen');

function run(fn, orders, products, opts) {
  try {
    return { ok: true, value: fn(orders, products, opts) };
  } catch (e) {
    return { ok: false, name: e && e.name, message: e && e.message };
  }
}

function same(orders, products, opts, label = '') {
  const a = run(buildReport, orders, products, opts);
  const b = run(ref, orders, products, opts);
  const ctx = `${label} ${JSON.stringify(opts)}`;
  assert.equal(a.ok, b.ok, `throw khác nhau: ${ctx}`);
  if (!a.ok) {
    assert.equal(a.name, b.name, ctx);
    assert.equal(a.message, b.message, ctx);
    return;
  }
  assert.deepStrictEqual(a.value, b.value, ctx);
  assert.equal(JSON.stringify(a.value), JSON.stringify(b.value), `thứ tự key/phần tử: ${ctx}`);
}

const OPTS = [
  {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 3 }, { topN: 1000 },
  { from: '2025-03' }, { to: '2025-09' }, { from: '2025-02', to: '2025-06', topN: 2 },
  { from: '2025-06', to: '2025-06' }, { from: '2025-09', to: '2025-02' }, { from: '2026-01' }, { to: '2024-01', topN: 0 },
];

const mk = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
const PRODS = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
  { sku: 'D', name: 'Vở', category: 'Văn phòng phẩm' },
];

test('ngẫu nhiên có seed, nhiều kích thước và tùy chọn', () => {
  const sizes = [1, 2, 10, 100, 1000, 5000];
  let seed = 0;
  for (const n of sizes) {
    for (let k = 0; k < 3; k++) {
      seed++;
      const d = generate({ orders: n, products: 5 + seed * 7, customers: 3 + seed * 11, seed });
      for (const o of OPTS) same(d.orders, d.products, o, `n=${n} seed=${seed}`);
    }
  }
});

test('bộ sinh riêng: nhiều tie, khách/sku ít, status trộn, múi giờ khác nhau', () => {
  const tzs = ['Z', '+07:00', '-05:00', '+00:00', '-11:30', '+14:00'];
  const statuses = ['paid', 'refunded', 'cancelled'];
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed * 7919);
    const pick = (n) => Math.floor(r() * n);
    const prods = [];
    for (let i = 0; i < 1 + pick(6); i++) prods.push({ sku: `S${pick(4)}`, name: `N${pick(3)}`, category: `K${pick(3)}` }); // có thể trùng sku
    const orders = [];
    const n = pick(300);
    for (let i = 0; i < n; i++) {
      const day = 1 + pick(31);
      const mon = 1 + pick(4);
      const d = `${2025 + pick(2)}-${String(mon).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}T${String(pick(24)).padStart(2, '0')}:${String(pick(60)).padStart(2, '0')}:00${tzs[pick(tzs.length)]}`;
      orders.push(mk(`O${pick(40)}`, `C${pick(6)}`, `S${pick(6)}`, pick(3), [0, 100, 100, 250][pick(4)], d, statuses[pick(3)]));
    }
    for (const o of OPTS) same(orders, prods, o, `seed=${seed}`);
  }
});

test('hòa nhau ở revenue, qty, sku, customerId (comparator)', () => {
  const prods = [
    { sku: 'Z', name: 'z', category: 'X' }, { sku: 'M', name: 'm', category: 'X' }, { sku: 'A', name: 'a', category: 'X' },
    { sku: 'P', name: 'p', category: 'Y' }, { sku: 'Q', name: 'q', category: 'Y' },
  ];
  const d = '2025-05-10T00:00:00Z';
  const orders = [];
  // cùng revenue, cùng qty (khác sku); cùng revenue khác qty; khách cùng revenue
  for (const s of ['Z', 'M', 'A']) orders.push(mk('o' + s, 'c' + s, s, 2, 500, d, 'paid'));
  orders.push(mk('o9', 'cB', 'P', 1, 1000, d, 'paid'), mk('o10', 'cA', 'Q', 4, 250, d, 'paid'));
  orders.push(mk('o11', 'cC', 'P', 1, 1000, d, 'paid'));
  for (const o of OPTS) same(orders, prods, o, 'ties');
  // tất cả hòa hoàn toàn, thứ tự đầu vào đảo ngược
  same(orders.slice().reverse(), prods, {}, 'ties-reversed');
  // hơn 5 khách hòa nhau để thử topCustomers.slice(0,5)
  const many = [];
  for (let i = 0; i < 9; i++) many.push(mk('o' + i, 'c' + ((i * 5) % 9), 'A', 1, 100, d, 'paid'));
  same(many, prods, {}, 'many-ties');
  same(many.slice().reverse(), prods, { topN: 2 }, 'many-ties-rev');
});

test('status paid/refunded/cancelled, khách chỉ có refunded, order trùng id', () => {
  const orders = [
    mk('o1', 'c1', 'A', 2, 1000, '2025-01-05T10:00:00Z', 'paid'),
    mk('o1', 'c1', 'B', 1, 500, '2025-01-05T10:00:00Z', 'paid'),
    mk('o1', 'c1', 'C', 3, 700, '2025-01-05T10:00:00Z', 'paid'),
    mk('o1', 'c3', 'A', 1, 100, '2025-01-06T10:00:00Z', 'paid'), // cùng id, khác khách
    mk('o2', 'c2', 'A', 1, 1000, '2025-02-01T03:00:00Z', 'refunded'),
    mk('o2', 'c2', 'B', 2, 1000, '2025-02-01T03:00:00Z', 'refunded'),
    mk('o3', 'c4', 'B', 4, 500, '2025-02-02T03:00:00Z', 'cancelled'),
    mk('o4', 'c5', 'D', 1, 900, '2025-03-02T03:00:00Z', 'cancelled'),
    mk('o2', 'c2', 'A', 1, 1000, '2025-03-01T03:00:00Z', 'paid'), // id trùng khác tháng
  ];
  for (const o of OPTS) same(orders, PRODS, o, 'status');
});

test('sku trùng trong products và sku lạ -> unknown', () => {
  const prods = [...PRODS, { sku: 'A', name: 'Trùng', category: 'Khác' }, { sku: 'B', name: 'Trùng2', category: 'Đồ uống' }];
  const orders = [
    mk('o1', 'c1', 'A', 2, 1000, '2025-01-05T10:00:00Z', 'paid'),
    mk('o2', 'c1', 'B', 1, 500, '2025-01-05T10:00:00Z', 'paid'),
    mk('o3', 'c2', 'NOPE', 3, 400, '2025-01-05T10:00:00Z', 'paid'),
    mk('o4', 'c2', 'NOPE2', 1, 4000, '2025-02-05T10:00:00Z', 'paid'),
    mk('o5', 'c2', 'NOPE', 1, 50, '2025-02-05T10:00:00Z', 'refunded'),
    mk('o6', 'c3', undefined, 1, 50, '2025-02-05T10:00:00Z', 'paid'),
    mk('o7', 'c3', 'unknown', 1, 50, '2025-02-05T10:00:00Z', 'paid'),
  ];
  for (const o of OPTS) same(orders, prods, o, 'dup-unknown');
  same(orders, [], {}, 'no-products');
});

test('ranh giới tháng UTC với +07:00 và -05:00', () => {
  const dates = [
    '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-02-01T06:59:59+07:00', '2025-02-01T07:00:00+07:00',
    '2025-01-31T18:59:59-05:00', '2025-01-31T19:00:00-05:00', '2025-02-28T20:00:00-05:00', '2025-03-01T06:30:00+07:00',
    '2024-12-31T23:30:00-05:00', '2025-01-01T01:00:00+07:00', '2024-02-29T23:00:00-05:00', '2025-12-31T22:00:00-05:00',
  ];
  const orders = dates.map((d, i) => mk('o' + i, 'c' + (i % 3), i % 2 ? 'A' : 'B', 1 + (i % 3), 300, d, i % 4 === 3 ? 'refunded' : 'paid'));
  for (const o of OPTS) same(orders, PRODS, o, 'tz');
  for (const m of ['2024-12', '2025-01', '2025-02', '2025-03', '2026-01']) {
    same(orders, PRODS, { from: m }, 'tz-from');
    same(orders, PRODS, { to: m }, 'tz-to');
    same(orders, PRODS, { from: m, to: m }, 'tz-both');
  }
});

test('qty/unitPrice bằng 0 (kể cả refunded, -0), grandTotal = 0', () => {
  const orders = [
    mk('o1', 'c1', 'A', 0, 1000, '2025-01-05T10:00:00Z', 'refunded'),
    mk('o2', 'c1', 'A', 3, 0, '2025-01-05T10:00:00Z', 'refunded'),
    mk('o3', 'c2', 'B', 0, 0, '2025-02-05T10:00:00Z', 'paid'),
    mk('o4', 'c2', 'B', 0, 0, '2025-02-05T10:00:00Z', 'refunded'),
    mk('o5', 'c3', 'C', 2, 0, '2025-03-05T10:00:00Z', 'paid'),
  ];
  for (const o of OPTS) same(orders, PRODS, o, 'zeros');
  // grandTotal = 0 do cân bằng paid/refunded
  const bal = [
    mk('o1', 'c1', 'A', 2, 500, '2025-01-05T10:00:00Z', 'paid'),
    mk('o2', 'c2', 'A', 2, 500, '2025-01-06T10:00:00Z', 'refunded'),
  ];
  for (const o of OPTS) same(bal, PRODS, o, 'balanced');
  // chỉ có -0
  same([mk('o1', 'c1', 'A', 0, 5, '2025-01-05T10:00:00Z', 'refunded')], PRODS, {}, 'neg-zero');
});

test('mảng rỗng, mọi dòng bị lọc/hủy', () => {
  for (const o of OPTS) same([], [], o, 'empty');
  for (const o of OPTS) same([], PRODS, o, 'empty-orders');
  const allCancelled = [mk('o1', 'c1', 'A', 1, 100, '2025-01-05T10:00:00Z', 'cancelled')];
  for (const o of OPTS) same(allCancelled, PRODS, o, 'all-cancelled');
});

test('giá trị không nguyên', () => {
  const orders = [];
  const r = rng(99);
  for (let i = 0; i < 400; i++) {
    const st = ['paid', 'refunded', 'cancelled'][Math.floor(r() * 3)];
    orders.push(mk(`o${Math.floor(r() * 50)}`, `c${Math.floor(r() * 8)}`, ['A', 'B', 'C', 'D', 'X'][Math.floor(r() * 5)],
      [0.1, 0.2, 1.5, 3, 7.25][Math.floor(r() * 5)], [0.1, 0.3, 19.99, 100.07, 1e-7][Math.floor(r() * 5)],
      `2025-0${1 + Math.floor(r() * 5)}-1${Math.floor(r() * 9)}T10:00:00Z`, st));
  }
  for (const o of OPTS) same(orders, PRODS, o, 'floats');
  same([mk('o', 'c', 'A', 1e21, 1e21, '2025-01-01T00:00:00Z', 'paid')], PRODS, {}, 'huge');
});

test('ngày sai: ném lỗi giống bản cũ', () => {
  const good = mk('o1', 'c1', 'A', 1, 100, '2025-01-05T10:00:00Z', 'paid');
  for (const bad of ['not-a-date', '', '2025-13-45T00:00:00Z', undefined, null]) {
    for (const st of ['paid', 'refunded', 'cancelled']) {
      const orders = [good, mk('o2', 'c2', 'A', 1, 100, bad, st), good];
      for (const o of [{}, { from: '2025-01' }, { to: '2024-01' }]) same(orders, PRODS, o, `bad=${bad} ${st}`);
    }
  }
});

test('thứ tự cộng dồn: kết quả bằng nhau từng bit với số thực', () => {
  const r = rng(5);
  const orders = [];
  for (let i = 0; i < 3000; i++) {
    orders.push(mk(`o${i % 700}`, `c${Math.floor(r() * 30)}`, ['A', 'B', 'C', 'D'][Math.floor(r() * 4)], 1 + Math.floor(r() * 3), r() * 1000,
      `2025-0${1 + Math.floor(r() * 6)}-10T10:00:00Z`, r() < 0.8 ? 'paid' : 'refunded'));
  }
  for (const o of OPTS) same(orders, PRODS, o, 'float-order');
});

test('hiệu năng: 200.000 dòng dưới 1 giây', () => {
  const d = generate({ orders: 200000, seed: 11 });
  const t0 = process.hrtime.bigint();
  const out = buildReport(d.orders, d.products);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(out.months.length > 0);
  assert.ok(ms < 1000, `quá chậm: ${ms.toFixed(0)} ms`);
});
