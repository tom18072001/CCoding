'use strict';
// Đối chiếu mở rộng buildReport (src) với bản cũ (fixture) — bản cũ là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const legacy = require('./fixtures/report.legacy').buildReport;

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// Duyệt song song: Object.is cho số (phân biệt -0), cùng thứ tự khóa ở mọi object.
function walk(a, b, path) {
  if (typeof a === 'number' || typeof b === 'number') {
    assert.ok(Object.is(a, b), `${path}: ${Object.is(a, -0) ? '-0' : a} !== ${Object.is(b, -0) ? '-0' : b}`);
    return;
  }
  if (a && typeof a === 'object') {
    assert.deepStrictEqual(Object.keys(a), Object.keys(b), `${path}: thứ tự khóa`);
    for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
    return;
  }
  assert.strictEqual(a, b, path);
}

function same(orders, products, options, label = '') {
  const o1 = clone(orders), p1 = clone(products), o2 = clone(orders), p2 = clone(products);
  const args = options === undefined ? [] : [options];
  const got = buildReport(o1, p1, ...args);
  const exp = legacy(o2, p2, ...args);
  assert.deepStrictEqual(got, exp, label);
  assert.strictEqual(JSON.stringify(got), JSON.stringify(exp), label + ' (JSON/thứ tự khóa)');
  walk(got, exp, label || 'report');
  return got;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const STATUSES = ['paid', 'refunded', 'cancelled'];
const DATES = [
  '2024-01-31T23:30:00-05:00', '2024-02-29T12:00:00Z', '2024-03-01T00:00:00Z', '2023-12-31T23:59:59Z',
  '2024-01-01T00:00:00+05:00', '2024-02-01T00:00:00Z', '2024-02-29T23:59:59-10:00', '2025-02-28T23:00:00-04:00',
  '2024-12-31T23:59:59.999Z', '2025-01-01T00:00:00Z', '2025-06-15T08:00:00Z', '2025-07-01T03:00:00+09:00',
];

function gen(seed, n, { nSku = 6, nCust = 5, nOrd = 20, small = false } = {}) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const products = [];
  for (let i = 0; i < nSku; i++) products.push({ sku: 'S' + i, name: 'P' + i, category: 'C' + (i % 3) });
  const orders = [];
  for (let i = 0; i < n; i++) {
    orders.push({
      id: 'o' + Math.floor(r() * nOrd),
      customerId: 'c' + Math.floor(r() * nCust),
      sku: r() < 0.1 ? 'MISSING' + Math.floor(r() * 2) : 'S' + Math.floor(r() * nSku),
      qty: small ? Math.floor(r() * 3) : Math.floor(r() * 6),
      unitPrice: small ? pick([0, 100, 100, 200]) : Math.floor(r() * 5000),
      date: pick(DATES),
      status: pick(STATUSES),
    });
  }
  return { orders, products };
}

const OPTS = [
  undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 2 }, { topN: 10 },
  { from: '2024-02' }, { to: '2024-02' }, { from: '2024-01', to: '2024-03' },
  { from: '2099-01' }, { to: '1999-01' }, { from: '2025-01', to: '2024-01' },
  { from: '2024-02', to: '2024-02', topN: 1 }, { from: '', to: '' }, { topN: undefined, from: undefined },
];

test('(a) fuzz nhiều seed, kích thước và options', () => {
  for (const n of [0, 1, 2, 5, 50, 300, 700]) {
    for (let seed = 1; seed <= 6; seed++) {
      const d = gen(seed * 31 + n, n);
      for (const o of OPTS) same(d.orders, d.products, o, `n=${n} seed=${seed} opts=${JSON.stringify(o)}`);
    }
  }
});

test('(b) hòa điểm: revenue, qty, sku, customerId', () => {
  const products = [
    { sku: 'B', name: 'b', category: 'X' }, { sku: 'A', name: 'a', category: 'X' },
    { sku: 'C', name: 'c', category: 'X' }, { sku: 'D', name: 'd', category: 'Y' },
    { sku: 'E', name: 'e', category: 'Z' },
  ];
  const mk = (id, customerId, sku, qty, unitPrice, status = 'paid', date = '2025-03-10T00:00:00Z') =>
    ({ id, customerId, sku, qty, unitPrice, date, status });
  const orders = [
    // cùng revenue 1000 khác qty: B qty 10 giá 100; A qty 1 giá 1000; C qty 5 giá 200
    mk('1', 'k2', 'B', 10, 100), mk('2', 'k1', 'A', 1, 1000), mk('3', 'k3', 'C', 5, 200),
    // hòa hoàn toàn revenue+qty -> so sku
    mk('4', 'k4', 'D', 2, 500), mk('5', 'k5', 'E', 2, 500),
    // category hòa total (X: 3000, Y: 1000, Z: 1000) -> so tên category
    mk('6', 'k1', 'Q', 1, 1000),
  ];
  for (const topN of [0, 1, 2, 3, 10]) same(orders, products, { topN });
  // nhiều khách hòa revenue, id số và chuỗi trộn lẫn
  const many = [];
  for (let i = 0; i < 12; i++) many.push(mk('o' + (i % 4), 'cust' + ((i * 7) % 12), 'A', 1, 100));
  same(many, products);
  same(many.reverse(), products);
  const numericIds = [mk(1, 10, 'A', 1, 100), mk(2, 9, 'A', 1, 100), mk(3, 2, 'A', 1, 100), mk(4, 'x', 'A', 1, 100)];
  same(numericIds, products);
  // tất cả hòa
  same([mk('a', 'z', 'A', 0, 0), mk('b', 'y', 'B', 0, 0)], products);
});

test('(c) sku không có trong products, trùng sku, products rỗng', () => {
  const d = gen(5, 200);
  same(d.orders, [], undefined, 'products rỗng');
  same(d.orders, [], { topN: 5 }, 'products rỗng topN 5');
  const dup = d.products.concat(d.products.map((p) => ({ ...p, name: 'dup-' + p.name, category: 'Dup' })));
  same(d.orders, dup, undefined, 'trùng toàn bộ');
  same(d.orders, dup.slice().reverse(), { topN: 4 }, 'trùng đảo thứ tự');
  same(d.orders, d.products.slice(0, 2), { topN: 2 }, 'thiếu nhiều sku');
  // category trùng tên 'unknown' với category thật
  same(d.orders, [{ sku: 'S0', name: 'n', category: 'unknown' }], undefined, "category 'unknown' thật");
});

test('(d) đơn nhiều dòng cùng id, trộn trạng thái', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'B', name: 'b', category: 'Y' }];
  const mk = (id, customerId, sku, qty, unitPrice, status, date) => ({ id, customerId, sku, qty, unitPrice, status, date });
  const orders = [
    mk('o1', 'c1', 'A', 1, 100, 'paid', '2025-01-10T00:00:00Z'),
    mk('o1', 'c1', 'B', 2, 100, 'refunded', '2025-01-10T00:00:00Z'),
    mk('o1', 'c1', 'A', 3, 100, 'cancelled', '2025-01-10T00:00:00Z'),
    mk('o1', 'c1', 'A', 1, 100, 'paid', '2025-02-10T00:00:00Z'), // cùng id khác tháng
    mk('o1', 'c2', 'B', 1, 100, 'paid', '2025-02-10T00:00:00Z'), // cùng id khác khách
    mk('o2', 'c2', 'A', 1, 100, 'refunded', '2025-02-11T00:00:00Z'), // chỉ refunded -> orders 0
    mk('o3', 'c3', 'A', 1, 100, 'cancelled', '2025-03-11T00:00:00Z'), // chỉ cancelled -> không có tháng/khách
  ];
  const r = same(orders, products);
  assert.ok(!r.months.includes('2025-03'));
  for (const o of OPTS) same(orders, products, o);
  for (let seed = 1; seed <= 10; seed++) {
    const d = gen(seed, 120, { nOrd: 4, nCust: 3 });
    same(d.orders, d.products, { topN: 3 });
  }
});

test('(e) múi giờ, ranh giới tháng/năm, năm nhuận', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const dates = [
    '2024-01-31T23:30:00-05:00', // -> 2024-02 UTC
    '2024-02-01T00:30:00+01:00', // -> 2024-01 UTC
    '2023-12-31T23:59:59.999Z', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00+14:00',
    '2024-02-29T00:00:00Z', '2024-02-28T23:59:59-01:00', '2023-02-28T23:59:59-01:00', '2023-03-01T00:00:00+00:00',
    '2024-12-31T20:00:00-05:00', '2024-06-30T23:59:59Z', '2024-07-01T00:00:00Z',
  ];
  const orders = dates.map((date, i) => ({ id: 'o' + i, customerId: 'c' + (i % 3), sku: 'A', qty: i + 1, unitPrice: 100, date, status: i % 4 === 3 ? 'refunded' : 'paid' }));
  const r = same(orders, products);
  assert.ok(r.months.includes('2024-02') && r.months.includes('2025-01'));
  for (const o of [{ from: '2024-02' }, { to: '2024-01' }, { from: '2024-01', to: '2024-01' }, { from: '2023-12', to: '2024-02' }, { from: '2025-01' }]) same(orders, products, o);
  // Date dạng khác (epoch ms/Date object) qua JSON bị đổi thành chuỗi; thử trực tiếp không clone
  const direct = [{ id: 'x', customerId: 'c', sku: 'A', qty: 1, unitPrice: 5, date: '2024-03-05', status: 'paid' }];
  assert.deepStrictEqual(buildReport(direct, products), legacy(direct, products));
});

test('(f) qty/giá 0 với refunded, doanh thu âm, grandTotal 0', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }, { sku: 'B', name: 'b', category: 'Y' }];
  const mk = (id, sku, qty, unitPrice, status, customerId = 'c') => ({ id, customerId, sku, qty, unitPrice, status, date: '2025-04-01T00:00:00Z' });
  const cases = {
    'refunded qty 0': [mk('1', 'A', 0, 100, 'refunded')],
    'refunded giá 0': [mk('1', 'A', 5, 0, 'refunded')],
    'refunded 0 và 0': [mk('1', 'A', 0, 0, 'refunded')],
    'paid 0': [mk('1', 'A', 0, 0, 'paid')],
    'chỉ refunded -> âm': [mk('1', 'A', 2, 100, 'refunded'), mk('2', 'B', 1, 50, 'refunded', 'd')],
    'grandTotal 0 do triệt tiêu': [mk('1', 'A', 2, 100, 'paid'), mk('2', 'A', 2, 100, 'refunded')],
    'grandTotal 0 + category khác': [mk('1', 'A', 1, 100, 'paid'), mk('2', 'B', 1, 100, 'refunded', 'd')],
    'tổng âm, share âm': [mk('1', 'A', 1, 100, 'paid'), mk('2', 'B', 3, 100, 'refunded', 'd')],
    'toàn cancelled': [mk('1', 'A', 1, 100, 'cancelled')],
  };
  for (const [name, orders] of Object.entries(cases)) {
    for (const o of [undefined, { topN: 0 }, { topN: 5 }]) same(orders, products, o, name);
  }
  const z = buildReport([mk('1', 'A', 0, 0, 'refunded')], products);
  const zl = legacy([mk('1', 'A', 0, 0, 'refunded')], products);
  assert.ok(Object.is(z.grandTotal, zl.grandTotal));
  assert.ok(Object.is(z.categories[0].total, zl.categories[0].total));
  assert.ok(Object.is(z.monthly[0].refunds, zl.monthly[0].refunds));
  // dữ liệu ngẫu nhiên nhiều 0
  for (let seed = 1; seed <= 15; seed++) {
    const d = gen(seed, 60, { small: true });
    same(d.orders, d.products, { topN: 4 }, 'small seed ' + seed);
  }
});

test('(g) Date không hợp lệ ném lỗi ở cả hai bản, kể cả dòng cancelled', () => {
  const products = [{ sku: 'A', name: 'a', category: 'X' }];
  const good = { id: '1', customerId: 'c', sku: 'A', qty: 1, unitPrice: 100, date: '2025-01-01T00:00:00Z', status: 'paid' };
  const bads = ['không phải ngày', '', 'invalid', '2025-13-45T00:00:00Z'];
  for (const date of bads) {
    for (const status of STATUSES) {
      const bad = { ...good, id: '2', date, status };
      for (const orders of [[bad], [good, bad], [bad, good]]) {
        for (const o of [undefined, { from: '2030-01' }, { to: '1990-01' }, { from: '2026-01', to: '2025-01' }]) {
          let e1, e2;
          try { buildReport(orders, products, o); } catch (e) { e1 = e; }
          try { legacy(orders, products, o); } catch (e) { e2 = e; }
          assert.ok(e1 && e2, `phải ném lỗi (date=${JSON.stringify(date)}, status=${status})`);
          assert.strictEqual(e1.constructor, e2.constructor);
          assert.strictEqual(e1.message, e2.message);
        }
      }
    }
  }
});

test('(h) không sửa đầu vào', () => {
  const d = gen(9, 150);
  const frozenOrders = deepFreeze(clone(d.orders));
  const frozenProducts = deepFreeze(clone(d.products));
  const o = deepFreeze({ topN: 2, from: '2024-01', to: '2025-12' });
  const r1 = buildReport(frozenOrders, frozenProducts, o); // frozen -> ném lỗi nếu ghi ở strict mode
  const r2 = legacy(frozenOrders, frozenProducts, o);
  assert.deepStrictEqual(r1, r2);
  // snapshot
  const before = JSON.stringify([d.orders, d.products]);
  buildReport(d.orders, d.products, { topN: 1 });
  assert.strictEqual(JSON.stringify([d.orders, d.products]), before);
  // kết quả không chia sẻ tham chiếu với đầu vào, gọi lặp cho kết quả giống nhau
  assert.deepStrictEqual(buildReport(d.orders, d.products), buildReport(d.orders, d.products));
});
