'use strict';
// Đối chiếu bản mới (src/report.js) với bản cũ (src/report.legacy.js) — bản cũ là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('../src/report.legacy.js').buildReport;
const next = require('../src/report.js').buildReport;
const { generate, rng } = require('../src/gen.js');

const clone = (v) => structuredClone(v);

function same(orders, products, options, label = '') {
  const o1 = clone(orders), p1 = clone(products), opt1 = options === undefined ? undefined : clone(options);
  const a = legacy(clone(orders), clone(products), opt1 === undefined ? undefined : clone(opt1));
  const b = next(o1, p1, opt1);
  assert.deepStrictEqual(b, a, label);
  assert.equal(JSON.stringify(b), JSON.stringify(a), `${label} (thứ tự khóa)`);
  return a;
}

const row = (id, customerId, sku, qty, unitPrice, date, status) => ({ id, customerId, sku, qty, unitPrice, date, status });
const D = '2025-03-10T10:00:00Z';
const prods = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
];

test('rỗng', () => {
  same([], [], undefined, 'cả hai rỗng');
  same([], prods, {}, 'orders rỗng');
  same([row('1', 'c', 'A', 1, 100, D, 'paid')], [], {}, 'products rỗng');
});

test('mọi status, gồm cancelled', () => {
  for (const st of ['paid', 'refunded', 'cancelled']) same([row('1', 'c', 'A', 2, 100, D, st)], prods, {}, st);
  same(['paid', 'refunded', 'cancelled'].map((s, i) => row('x' + i, 'c' + i, 'A', 1 + i, 100, D, s)), prods, {});
  same([row('1', 'c', 'A', 1, 100, D, 'weird')], prods, {}, 'status lạ');
});

const multiMonth = () => {
  const ds = ['2025-01-15T00:00:00Z', '2025-02-15T00:00:00Z', '2025-03-15T00:00:00Z', '2025-04-15T00:00:00Z'];
  return ds.map((d, i) => row('o' + i, 'c' + (i % 2), i % 2 ? 'A' : 'B', 1 + i, 100, d, 'paid'));
};

test('from/to', () => {
  const o = multiMonth();
  for (const opt of [{ from: '2025-02' }, { to: '2025-03' }, { from: '2025-02', to: '2025-03' }, { from: '2025-03', to: '2025-02' },
    { from: '2025-02', to: '2025-02' }, { from: '2030-01' }, { to: '2000-01' }, { from: '', to: '' }, { from: null, to: undefined }])
    same(o, prods, opt, JSON.stringify(opt));
});

test('topN', () => {
  const d = generate({ orders: 1500, products: 30, seed: 11 });
  for (const topN of [0, 1, 2, 3, 5, 1000, -1, -5, null, undefined, 1.5, 2.9, NaN, '2'])
    same(d.orders, d.products, { topN }, `topN=${topN}`);
  same(d.orders, d.products, undefined, 'options undefined');
  same(d.orders, d.products, {}, 'options rỗng');
});

test('sku trùng / không có trong products', () => {
  const dup = [{ sku: 'A', name: 'Đầu', category: 'X' }, { sku: 'A', name: 'Sau', category: 'Y' }, ...prods];
  const o = [row('1', 'c', 'A', 1, 100, D, 'paid'), row('2', 'c', 'ZZ', 3, 100, D, 'paid'), row('3', 'c', 'ZZ', 1, 50, D, 'refunded')];
  const r = same(o, dup, {});
  assert.ok(r.categories.some((c) => c.category === 'X'));
  assert.ok(!r.categories.some((c) => c.category === 'Y'));
  same(o, [{ sku: 'A', name: 'n' }, { sku: 'B', category: 'k' }], {}, 'thiếu name/category');
  same([row('1', 'c', undefined, 1, 100, D, 'paid')], prods, {}, 'sku undefined');
  same([row('1', 'c', NaN, 1, 100, D, 'paid')], [{ sku: NaN, name: 'n', category: 'c' }], {}, 'sku NaN');
});

test('hòa doanh thu / số lượng (comparator)', () => {
  const ps = ['E', 'D', 'C', 'B', 'A'].map((s) => ({ sku: s, name: s, category: 'K' }));
  const o = [];
  ['E', 'D', 'C', 'B', 'A'].forEach((s, i) => {
    o.push(row('a' + i, 'k' + (4 - i), s, 2, 100, D, 'paid'));
    o.push(row('b' + i, 'k' + i, s, 1, 200, D, 'paid'));
  });
  same(o, ps, { topN: 10 }, 'hòa');
  same([...o].reverse(), ps, { topN: 10 }, 'hòa đảo thứ tự');
  const ps2 = [{ sku: 'a', name: 'a', category: 'Z' }, { sku: 'b', name: 'b', category: 'M' }, { sku: 'c', name: 'c', category: 'A' }];
  same(['a', 'b', 'c'].map((s, i) => row('i' + i, 'c', s, 1, 100, D, 'paid')), ps2, {}, 'hòa category');
  same([row('1', 'c1', 'A', 4, 100, D, 'paid'), row('2', 'c2', 'B', 2, 200, D, 'paid'), row('3', 'c3', 'C', 1, 400, D, 'paid')],
    [{ sku: 'A', name: 'a', category: 'K' }, { sku: 'B', name: 'b', category: 'K' }, { sku: 'C', name: 'c', category: 'K' }], { topN: 5 }, 'hòa rev, khác qty');
});

test('hoàn tiền làm tổng 0, grandTotal = 0', () => {
  same([row('1', 'c', 'A', 2, 100, D, 'paid'), row('2', 'c', 'A', 2, 100, D, 'refunded')], prods, {}, 'tổng 0');
  same([row('1', 'c', 'A', 1, 100, D, 'refunded')], prods, {}, 'chỉ hoàn');
  same([row('1', 'c', 'A', 0, 100, D, 'paid')], prods, {}, 'qty 0');
  same([row('1', 'c', 'A', 1, 0, D, 'refunded')], prods, {}, '-0');
  same([row('1', 'c', 'A', 1, 100, D, 'cancelled')], prods, {}, 'chỉ cancelled');
  same([row('1', 'c', 'A', 1, 100, D, 'paid'), row('2', 'd', 'B', 1, 100, '2025-04-01T00:00:00Z', 'refunded'), row('3', 'd', 'B', 1, 100, D, 'refunded')], prods, {}, 'tổng 0 nhiều danh mục');
});

test('cùng id nhiều dòng; khách vừa paid vừa refunded', () => {
  const o = [
    row('1', 'c1', 'A', 1, 100, D, 'paid'), row('1', 'c1', 'B', 1, 100, D, 'paid'), row('1', 'c1', 'C', 1, 100, D, 'paid'),
    row('2', 'c1', 'A', 1, 100, D, 'refunded'), row('2', 'c2', 'A', 1, 100, D, 'refunded'),
    row('1', 'c2', 'A', 1, 100, '2025-05-01T00:00:00Z', 'paid'), row('3', 'c3', 'B', 1, 100, D, 'cancelled'),
  ];
  same(o, prods, {});
  same(o, prods, { topN: 1 });
});

test('múi giờ làm đổi tháng UTC', () => {
  const o = [
    row('1', 'c', 'A', 1, 100, '2025-03-01T02:00:00+07:00', 'paid'),
    row('2', 'c', 'A', 1, 100, '2025-01-31T23:00:00-05:00', 'paid'),
    row('3', 'c', 'A', 1, 100, '2025-03-31T23:30:00-02:00', 'paid'),
    row('4', 'c', 'A', 1, 100, '2025-12-31T23:59:59Z', 'paid'),
    row('5', 'c', 'A', 1, 100, '2026-01-01T00:00:00+01:00', 'paid'),
    row('6', 'c', 'A', 1, 100, '2025-03-10', 'paid'),
    row('7', 'c', 'A', 1, 100, 1741600000000, 'paid'),
  ];
  const r = same(o, prods, {});
  assert.ok(r.months.includes('2025-02'));
  same(o, prods, { from: '2025-02', to: '2025-02' });
  same(o, prods, { from: '2025-03' });
});

test('một danh mục ở nhiều tháng', () => {
  const r = same(multiMonth(), prods, {});
  assert.ok(Object.keys(r.categories[0].byMonth).length > 1);
  same(multiMonth(), prods, { from: '2025-02', to: '2025-03' });
});

test('giá trị bất thường của trường', () => {
  const o = [
    row('1', 'c', 'A', Infinity, 100, D, 'paid'),
    row('2', 'c', 'B', 1.5, 0.25, D, 'paid'),
    row(undefined, undefined, 'A', 1, 100, D, 'paid'),
    row(1, 1, 'A', 1, 100, D, 'paid'),
    row('1', 1, 'A', 1, 100, D, 'paid'),
    row('1', 'c', 'B', 1, undefined, D, 'paid'),
    row('1', 'c', 'B', '2', '3', D, 'paid'),
  ];
  for (const x of o) same([x, row('z', 'q', 'C', 1, 1, D, 'paid')], prods, {}, JSON.stringify(x));
  same(o, prods, {}, 'gộp');
});

test('ngẫu nhiên nhiều seed', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const d = generate({ orders: 300 + seed * 100, products: 5 + seed * 2, customers: 3 + seed * 7, seed });
    const opts = [{}, { topN: 1 }, { topN: 10 }, { from: '2025-03', to: '2025-09' }, { from: '2025-06' }, { to: '2025-04', topN: 0 }];
    for (const o of opts) same(d.orders, d.products, o, `seed ${seed} ${JSON.stringify(o)}`);
  }
});

test('ngẫu nhiên hỗn hợp: sku trùng, hòa, múi giờ, status', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = rng(seed * 7919);
    const pick = (n) => Math.floor(r() * n);
    const ps = [];
    for (let i = 0; i < 12; i++) ps.push({ sku: 'S' + pick(8), name: 'n' + pick(3), category: 'K' + pick(4) });
    const tzs = ['Z', '+07:00', '-08:00', '+14:00', '-12:00'];
    const sts = ['paid', 'paid', 'refunded', 'cancelled'];
    const o = [];
    for (let i = 0; i < 800; i++)
      o.push(row('O' + pick(150), 'C' + pick(20), 'S' + pick(10), pick(4), 100 * (1 + pick(3)),
        `2025-${String(1 + pick(12)).padStart(2, '0')}-${String(1 + pick(28)).padStart(2, '0')}T${String(pick(24)).padStart(2, '0')}:00:00${tzs[pick(5)]}`, sts[pick(4)]));
    for (const opt of [{}, { topN: 2 }, { topN: 0 }, { from: '2025-02', to: '2025-11' }])
      same(o, ps, opt, `seed ${seed}`);
  }
});

test('lỗi: date không hợp lệ ném cùng loại lỗi', () => {
  for (const bad of ['không phải ngày', '', undefined, null, NaN, {}, '2025-13-45']) {
    const o = [row('1', 'c', 'A', 1, 100, D, 'paid'), row('2', 'c', 'A', 1, 100, bad, 'paid')];
    let ea, eb;
    try { legacy(clone(o), prods, {}); } catch (e) { ea = e; }
    try { next(clone(o), prods, {}); } catch (e) { eb = e; }
    assert.equal(!!eb, !!ea, `ném lỗi hay không: ${String(bad)}`);
    if (ea) {
      assert.equal(eb.constructor, ea.constructor);
      assert.equal(eb.message, ea.message);
    }
  }
  const o = [row('2', 'c', 'A', 1, 100, 'xxx', 'cancelled')];
  let ea, eb;
  try { legacy(o, prods, { from: '2025-01' }); } catch (e) { ea = e; }
  try { next(o, prods, { from: '2025-01' }); } catch (e) { eb = e; }
  assert.equal(eb?.constructor, ea?.constructor);
});

test('đầu vào không bị sửa, không cache giữa các lần gọi', () => {
  const d = generate({ orders: 1000, products: 40, seed: 5 });
  const o0 = clone(d.orders), p0 = clone(d.products), opt = { topN: 4, from: '2025-02', to: '2025-10' }, opt0 = clone(opt);
  const r1 = next(d.orders, d.products, opt);
  assert.deepStrictEqual(d.orders, o0);
  assert.deepStrictEqual(d.products, p0);
  assert.deepStrictEqual(opt, opt0);
  const r2 = next(d.orders, d.products, opt);
  assert.deepStrictEqual(r2, r1);
  assert.notStrictEqual(r2, r1);
  assert.notStrictEqual(r2.monthly, r1.monthly);
});
