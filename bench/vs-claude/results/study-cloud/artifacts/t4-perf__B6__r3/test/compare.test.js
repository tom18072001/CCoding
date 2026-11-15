'use strict';
// Đối chiếu buildReport hiện tại (src/report.js) với bản gốc (test/legacy/report.legacy.js).
const test = require('node:test');
const assert = require('node:assert');
const { buildReport: legacy } = require('./legacy/report.legacy');
const { buildReport: current } = require('../src/report');
const { generate, rng } = require('../src/gen');

function run(fn, args) {
  try {
    return { ok: true, value: fn(...args.map((a) => structuredClone(a))) };
  } catch (e) {
    return { ok: false, name: e && e.constructor && e.constructor.name, message: e && e.message };
  }
}

function same(orders, products, options, label) {
  const args = options === undefined ? [orders, products] : [orders, products, options];
  const before = JSON.stringify(args);
  const a = run(legacy, args);
  const b = run(current, args);
  assert.strictEqual(b.ok, a.ok, `${label}: khác nhau về việc ném lỗi`);
  if (a.ok) {
    assert.deepStrictEqual(b.value, a.value, label);
    assert.strictEqual(JSON.stringify(b.value), JSON.stringify(a.value), `${label}: thứ tự khóa/phần tử`);
  } else {
    assert.strictEqual(b.name, a.name, `${label}: loại lỗi`);
    assert.strictEqual(b.message, a.message, `${label}: thông điệp lỗi`);
  }
  // không sửa đầu vào
  assert.strictEqual(JSON.stringify(args), before, `${label}: đầu vào bị sửa`);
  return a;
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cà phê', category: 'Đồ uống' },
  { sku: 'D', name: 'Vở', category: 'Văn phòng phẩm' },
];
let n = 0;
const row = (o = {}) => ({ id: `o${++n}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid', ...o });

test('rỗng', () => {
  same([], [], undefined, 'rỗng');
  same([], P, { topN: 0 }, 'rỗng + products');
});

test('chỉ cancelled', () => {
  same([row({ status: 'cancelled' }), row({ status: 'cancelled', sku: 'B' })], P, undefined, 'cancelled');
});

test('chỉ refunded (revenue âm)', () => {
  same([row({ status: 'refunded' }), row({ status: 'refunded', sku: 'B', qty: 3 })], P, undefined, 'refunded');
});

test('sku lạ và sku trùng trong products', () => {
  const dup = [...P, { sku: 'A', name: 'Trà bản 2', category: 'Khác' }, { sku: 'B', name: 'Bút 2', category: 'Đồ uống' }];
  const orders = [row({ sku: 'ZZZ' }), row({ sku: 'A' }), row({ sku: 'B', qty: 2 }), row({ sku: undefined }), row({ sku: null })];
  same(orders, P, undefined, 'sku lạ');
  same(orders, dup, undefined, 'sku trùng');
  same(orders, [{ sku: 'A', name: 'x', category: 'unknown' }], undefined, 'category literal unknown');
});

test('nhiều đơn nhiều dòng, trộn trạng thái', () => {
  const orders = [];
  for (let i = 0; i < 30; i++) {
    const id = `m${i % 7}`;
    for (let l = 0; l < 1 + (i % 4); l++) {
      orders.push(row({ id, customerId: `c${i % 5}`, sku: 'ABCDX'[(i + l) % 5], qty: 1 + (l % 3), status: ['paid', 'refunded', 'cancelled', 'paid'][(i + l) % 4], date: `2025-0${1 + (i % 3)}-1${l}T08:00:00Z` }));
    }
  }
  for (const topN of [0, 1, 2, 10, undefined]) same(orders, P, topN === undefined ? {} : { topN }, `nhiều dòng topN=${topN}`);
});

test('hoà doanh thu giữa sản phẩm, danh mục, khách hàng', () => {
  const orders = [];
  for (const sku of ['D', 'C', 'B', 'A']) for (const c of ['z', 'b', 'a', 'm']) orders.push(row({ sku, customerId: c, qty: 2, unitPrice: 500 }));
  orders.push(row({ sku: 'A', customerId: 'x', qty: 8, unitPrice: 500 }));
  orders.push(row({ sku: 'C', customerId: 'y', qty: 4, unitPrice: 1000 }));
  for (const topN of [0, 1, 2, 10, undefined]) same(orders, P, { topN }, `hoà topN=${topN}`);
  same(orders, P, undefined, 'hoà không options');
  same(orders, P.map((p) => ({ ...p, category: 'Chung' })), undefined, 'một danh mục');
});

test('biên from/to và tháng chéo múi giờ', () => {
  const dates = [
    '2025-01-31T23:59:59Z', '2025-02-01T00:00:00Z', '2025-02-01T06:59:59+07:00', '2025-02-01T07:00:00+07:00',
    '2025-01-31T19:00:00-05:00', '2025-01-31T18:59:59-05:00', '2025-02-28T23:30:00-05:00', '2025-03-01T06:30:00+07:00',
    '2025-12-31T23:00:00-05:00', '2025-12-31T23:00:00Z', '2024-12-31T20:00:00-05:00', '2025-04-30T17:00:00Z', '2025-04-30T23:30:00+07:00',
  ];
  const orders = dates.map((date, i) => row({ date, customerId: `c${i % 3}`, sku: 'AB'[i % 2], qty: i + 1 }));
  const opts = [undefined, {}, { from: '2025-02' }, { to: '2025-02' }, { from: '2025-02', to: '2025-02' }, { from: '2025-01', to: '2025-03' },
    { from: '2025-03', to: '2025-01' }, { from: '2026-01' }, { to: '2000-01' }, { from: '2025-12' }, { from: '', to: '' }, { from: '2025-02', to: '2025-04', topN: 1 }];
  opts.forEach((o, i) => same(orders, P, o, `biên #${i}`));
});

test('topN 0/1/10/không truyền, topN khác thường', () => {
  const d = generate({ orders: 800, products: 40, customers: 20, seed: 11 });
  for (const o of [undefined, {}, { topN: 0 }, { topN: 1 }, { topN: 10 }, { topN: null }, { topN: undefined }, { topN: 1000 }]) same(d.orders, d.products, o, `topN ${JSON.stringify(o)}`);
});

test('grandTotal bằng 0', () => {
  same([row({ unitPrice: 0 }), row({ qty: 0 })], P, undefined, 'giá 0');
  same([row({ unitPrice: 1000 }), row({ unitPrice: 1000, status: 'refunded' })], P, undefined, 'paid triệt tiêu refunded');
  same([row({ unitPrice: 1000, sku: 'A' }), row({ unitPrice: 1000, status: 'refunded', sku: 'B', date: '2025-02-03T00:00:00Z' })], P, undefined, 'tổng 0 khác tháng');
});

test('Date không hợp lệ: cùng loại lỗi', () => {
  for (const date of ['không phải ngày', '', undefined, 'ab', '2025-13-45T00:00:00Z', NaN]) {
    const r = same([row(), row({ date })], P, undefined, `date=${String(date)}`);
    assert.strictEqual(r.ok, false, `date=${String(date)} phải ném lỗi`);
  }
  same([row({ date: null })], P, undefined, 'date null');
  // dòng không hợp lệ nhưng bị loại: vẫn ném (toISOString chạy trước lọc)
  same([row({ date: 'xxx', status: 'cancelled' })], P, undefined, 'cancelled + date lỗi');
  same([row({ date: 'xxx' })], P, { from: '2030-01' }, 'ngoài khoảng + date lỗi');
});

test('trường thừa, undefined, giá trị lạ', () => {
  const orders = [
    row({ extra: 1, note: { a: [1, undefined] } }),
    row({ id: undefined }),
    row({ customerId: undefined }),
    row({ customerId: null, id: null }),
    row({ qty: undefined }),
    row({ unitPrice: undefined }),
    row({ qty: NaN }),
    row({ unitPrice: Infinity }),
    row({ qty: -0, unitPrice: 5 }),
    row({ qty: -2, unitPrice: 100 }),
    row({ qty: 1.5, unitPrice: 333 }),
    row({ status: undefined }),
    row({ status: 'weird' }),
    row({ id: 7, customerId: 7 }),
    row({ id: '7', customerId: '7' }),
    row({ date: Date.UTC(2025, 4, 5) }),
  ];
  orders.forEach((o, i) => same([o, row()], P, undefined, `lạ #${i}`));
  same(orders, P, undefined, 'lạ gộp');
  same([row()], [{ sku: 'A', name: undefined, category: undefined }], undefined, 'product thiếu trường');
  same([row()], [{ sku: 'A', name: 'n', category: 'c', extra: 1 }, { sku: undefined, name: 'u', category: 'u' }], undefined, 'product thừa');
  same([row({ sku: undefined })], [{ sku: undefined, name: 'u', category: 'u' }], undefined, 'sku undefined khớp');
  same([row({ sku: NaN })], [{ sku: NaN, name: 'u', category: 'u' }], undefined, 'sku NaN');
});

test('~50 bộ ngẫu nhiên có seed (gen.js + rng)', () => {
  const r = rng(20261102);
  for (let i = 0; i < 50; i++) {
    const orders = 1 + Math.floor(r() * (i < 35 ? 60 : 3000));
    const d = generate({ orders, products: 1 + Math.floor(r() * 60), customers: 1 + Math.floor(r() * 40), seed: i + 1 });
    // thêm biến động: múi giờ, sku lạ, trạng thái
    const rr = rng(1000 + i);
    for (const o of d.orders) {
      const x = rr();
      if (x < 0.1) o.date = o.date.replace(/(Z|\+07:00)$/, '-05:00');
      else if (x < 0.15) o.date = '2025-12-31T23:30:00-05:00';
      else if (x < 0.2) o.unitPrice = 1000;
      if (rr() < 0.02) o.sku = undefined;
      if (rr() < 0.02) o.extra = { k: [rr()] };
    }
    const opts = [{}, { topN: 1 }, { topN: 0 }, { topN: 10 }, { from: '2025-03', to: '2025-09', topN: 2 }, { from: '2025-06' }, { to: '2025-05' }][i % 7];
    same(d.orders, d.products, opts, `ngẫu nhiên #${i} ${JSON.stringify(opts)}`);
  }
});
