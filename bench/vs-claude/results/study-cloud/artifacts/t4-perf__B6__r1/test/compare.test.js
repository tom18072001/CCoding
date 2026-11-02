'use strict';
// So sánh buildReport hiện tại với bản cũ (test/legacy-report.js) — bản cũ là đặc tả.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const legacy = require('./legacy-report').buildReport;
const current = require(path.join(__dirname, '..', 'src', 'report')).buildReport;
const { generate } = require(path.join(__dirname, '..', 'src', 'gen'));

function same(orders, products, options, label) {
  // options === undefined => không truyền tham số thứ ba
  const args = options === undefined ? [orders, products] : [orders, products, options];
  const a = legacy(...structuredClone(args));
  const b = current(...structuredClone(args));
  assert.deepStrictEqual(b, a, label);
  assert.strictEqual(JSON.stringify(b), JSON.stringify(a), `${label} (JSON/thứ tự)`);
  for (let i = 0; i < a.categories.length; i++) {
    assert.deepStrictEqual(Object.keys(b.categories[i].byMonth), Object.keys(a.categories[i].byMonth), `${label} thứ tự key byMonth`);
  }
}

const P = [
  { sku: 'A', name: 'Trà', category: 'Đồ uống' },
  { sku: 'B', name: 'Bút', category: 'Văn phòng phẩm' },
  { sku: 'C', name: 'Cốc', category: 'Gia dụng' },
];
let n = 0;
const row = (o = {}) => ({ id: `o${++n}`, customerId: 'c1', sku: 'A', qty: 1, unitPrice: 1000, date: '2025-01-05T10:00:00Z', status: 'paid', ...o });

test('ngẫu nhiên nhiều seed, nhỏ và vừa', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const size = [0, 1, 5, 30, 200, 1500][seed % 6];
    const d = generate({ orders: size, products: seed % 3 === 0 ? 5 : 60, customers: seed % 2 ? 10 : 100, seed });
    same(d.orders, d.products, undefined, `seed ${seed} mặc định`);
    same(d.orders, d.products, { topN: 1 + (seed % 5) }, `seed ${seed} topN`);
    same(d.orders, d.products, { from: '2025-03', to: '2025-09', topN: 10 }, `seed ${seed} from-to`);
  }
  for (const seed of [101, 102, 103]) {
    const d = generate({ orders: 8000, seed });
    same(d.orders, d.products, { topN: 4, from: '2025-02' }, `vừa ${seed}`);
  }
});

test('rỗng', () => {
  same([], P, undefined, 'orders rỗng');
  same([], P, { topN: 0, from: '2025-01' }, 'orders rỗng + options');
  same([row(), row({ sku: 'B' })], [], undefined, 'products rỗng');
  same([], [], undefined, 'cả hai rỗng');
});

test('sku lạ và trùng sku trong products', () => {
  same([row({ sku: 'ZZ' }), row({ sku: 'ZZ2', qty: 3 }), row({ sku: 'A' })], P, undefined, 'sku lạ');
  const dup = [...P, { sku: 'A', name: 'Trà 2', category: 'Khác' }];
  same([row(), row({ sku: 'A', qty: 4 })], dup, undefined, 'trùng sku');
});

test('topN', () => {
  const d = generate({ orders: 600, products: 40, seed: 7 });
  for (const topN of [0, 1, 2, 1000, undefined, null]) same(d.orders, d.products, { topN }, `topN=${topN}`);
  same(d.orders, d.products, {}, 'options rỗng');
});

test('from/to', () => {
  const d = generate({ orders: 800, seed: 11 });
  same(d.orders, d.products, { from: '2025-04' }, 'from');
  same(d.orders, d.products, { to: '2025-08' }, 'to');
  same(d.orders, d.products, { from: '2025-04', to: '2025-08' }, 'from+to');
  same(d.orders, d.products, { from: '2025-08', to: '2025-04' }, 'from>to');
  same(d.orders, d.products, { from: '', to: '' }, 'from/to rỗng');
  same(d.orders, d.products, { from: '2025-05', to: '2025-05' }, 'một tháng');
  same(d.orders, d.products, { from: '2030-01' }, 'from ngoài dữ liệu');
  same(d.orders, d.products, { from: null, to: undefined }, 'null/undefined');
});

test('toàn cancelled / refunded / grandTotal=0', () => {
  same([row({ status: 'cancelled' }), row({ status: 'cancelled', sku: 'B' })], P, undefined, 'toàn cancelled');
  same([row({ status: 'refunded' }), row({ status: 'refunded', sku: 'B', qty: 3 })], P, undefined, 'toàn refunded');
  same([row({ status: 'paid', qty: 2 }), row({ status: 'refunded', qty: 2, sku: 'A' })], P, undefined, 'grandTotal=0');
  same([row({ qty: 0 }), row({ unitPrice: 0, sku: 'B' })], P, undefined, 'grandTotal=0 do qty/price 0');
});

test('hòa điểm', () => {
  const orders = [
    row({ sku: 'A', customerId: 'cb', unitPrice: 1000 }),
    row({ sku: 'B', customerId: 'ca', unitPrice: 1000 }),
    row({ sku: 'C', customerId: 'cc', unitPrice: 1000 }),
    row({ sku: 'A', customerId: 'cd', qty: 2, unitPrice: 500 }),
    row({ sku: 'X1', customerId: 'ce', unitPrice: 1000 }),
    row({ sku: 'X0', customerId: 'cf', unitPrice: 1000 }),
  ];
  same(orders, P, undefined, 'hòa revenue');
  const K = ['A', 'B', 'C', 'X0', 'X1'].map((sku) => ({ sku, name: sku.toLowerCase(), category: 'K' }));
  same(orders, K, { topN: 10 }, 'hòa trong 1 danh mục');
  same([row({ sku: 'A', qty: 1, unitPrice: 2000 }), row({ sku: 'B', qty: 2, unitPrice: 1000 })], K, undefined, 'hòa revenue khác qty');
  same([row({ sku: 'B' }), row({ sku: 'A' }), row({ sku: 'C' })], P, undefined, 'hòa danh mục');
  same(Array.from({ length: 8 }, (_, i) => row({ customerId: `k${7 - i}` })), P, undefined, 'hòa customerId');
  same(Array.from({ length: 8 }, (_, i) => row({ customerId: 100 - i })), P, undefined, 'hòa customerId số');
});

test('múi giờ đổi tháng UTC', () => {
  const orders = [
    row({ date: '2024-01-31T23:30:00-05:00' }),
    row({ date: '2025-03-01T00:30:00+07:00' }),
    row({ date: '2025-12-31T20:00:00-08:00' }),
    row({ date: '2024-02-29T23:59:59.999Z' }),
    row({ date: '2024-03-01T00:00:00+00:00' }),
  ];
  same(orders, P, undefined, 'tz');
  same(orders, P, { from: '2024-02', to: '2024-02' }, 'tz lọc');
  same(orders, P, { to: '2024-01' }, 'tz lọc to');
});

test('id nhiều dòng, kiểu số/chuỗi', () => {
  const orders = [
    row({ id: 'x', customerId: 'c1' }), row({ id: 'x', customerId: 'c1', sku: 'B' }),
    row({ id: 1, customerId: 1 }), row({ id: '1', customerId: '1' }), row({ id: 1, customerId: '1', sku: 'B' }),
    row({ id: 2, customerId: 10 }), row({ id: 2, customerId: 9 }), row({ id: 3, customerId: '9' }),
    row({ id: 'x', status: 'refunded', customerId: 'c2' }),
  ];
  same(orders, P, undefined, 'id/customerId kiểu');
  same(orders.map((o) => ({ ...o, status: 'refunded' })), P, undefined, 'số/chuỗi toàn refunded');
});

test('qty hoặc unitPrice bằng 0', () => {
  same([row({ qty: 0 }), row({ unitPrice: 0, sku: 'B' }), row({ qty: 0, status: 'refunded', sku: 'C' }), row({ qty: 2 })], P, undefined, 'zero');
  same([row({ qty: 0, id: 'z' }), row({ unitPrice: 0, id: 'z2', customerId: 'c9' })], P, undefined, 'zero hết');
});

test('refunded và paid trộn trong cùng một đơn', () => {
  const orders = [
    row({ id: 'm', status: 'paid', qty: 3 }), row({ id: 'm', status: 'refunded', qty: 1 }),
    row({ id: 'm', status: 'refunded', sku: 'B', qty: 5 }), row({ id: 'm', status: 'paid', sku: 'B', qty: 1 }),
    row({ id: 'r', status: 'refunded', customerId: 'c3', date: '2025-02-10T00:00:00Z' }),
    row({ id: 'm', status: 'cancelled', qty: 9 }),
  ];
  same(orders, P, undefined, 'trộn');
  same(orders, P, { topN: 0 }, 'trộn topN=0');
});

test('nhiều năm', () => {
  const dates = ['2023-12-31T23:59:59Z', '2024-01-01T00:00:00Z', '2022-06-15T12:00:00Z', '2025-01-02T00:00:00+07:00', '2024-06-15T12:00:00Z', '2021-02-28T12:00:00Z'];
  const orders = dates.flatMap((date, i) => [row({ date, sku: 'ABC'[i % 3], customerId: `c${i % 4}` }), row({ date, status: 'refunded', sku: 'B' })]);
  same(orders, P, undefined, 'nhiều năm');
  same(orders, P, { from: '2022-01', to: '2024-01' }, 'nhiều năm lọc');
});

test('dòng có trường thừa', () => {
  same([row({ extra: { a: 1 } }), row({ note: undefined }), row({ sku: 'B', qty: 2 })], P, undefined, 'trường thừa');
});
