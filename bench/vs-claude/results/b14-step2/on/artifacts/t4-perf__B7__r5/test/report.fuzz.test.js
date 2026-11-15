'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport } = require('../src/report');
const { buildReportLegacy } = require('./report.legacy');

// PRNG mulberry32 có seed cố định
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TZ = ['Z', '+00:00', '+07:00', '-05:00', '-11:30', '+14:00', '-00:30'];
const STATUS = ['paid', 'paid', 'paid', 'refunded', 'cancelled'];

function genCase(seed) {
  const r = rng(seed);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (arr) => arr[int(0, arr.length - 1)];
  const pad = (n) => String(n).padStart(2, '0');

  const nProd = seed % 17 === 0 ? 0 : int(1, 12);
  const cats = ['Đồ uống', 'Bánh', 'Văn phòng phẩm', 'K', 'a', 'B', ''];
  const products = [];
  for (let i = 0; i < nProd; i++) products.push({ sku: 'S' + int(0, Math.max(1, nProd - 2)), name: 'N' + int(0, 5), category: pick(cats) });
  // sku có thể trùng ở trên (cố ý); thêm sku trùng tường minh
  if (nProd > 1 && seed % 3 === 0) products.push({ ...products[0], name: 'dup', category: pick(cats) });

  const nOrd = seed % 19 === 0 ? 0 : int(20, 300);
  const nCust = int(1, 15);
  const months = int(1, 8);
  const startM = int(1, 12);
  const idMode = seed % 4; // 0 chuỗi, 1 số, 2 lẫn lộn, 3 ít id (trùng nhiều)
  const orders = [];
  for (let i = 0; i < nOrd; i++) {
    const mi = startM - 1 + int(0, months - 1);
    const y = 2024 + Math.floor(mi / 12);
    const m = (mi % 12) + 1;
    const day = int(1, 28);
    const date = `${y}-${pad(m)}-${pad(day)}T${pad(int(0, 23))}:${pad(int(0, 59))}:00${pick(TZ)}`;
    const n = idMode === 3 ? int(1, 10) : int(1, 60);
    const id = idMode === 0 ? 'o' + n : idMode === 1 ? n : r() < 0.5 ? n : String(n);
    const qtyR = r();
    const qty = qtyR < 0.1 ? 0 : qtyR < 0.2 ? -int(1, 5) : int(1, 9);
    const sku = r() < 0.15 ? 'MISSING' + int(0, 2) : 'S' + int(0, Math.max(1, nProd - 2) + 1);
    orders.push({
      id,
      customerId: r() < 0.5 ? 'c' + int(1, nCust) : int(1, nCust),
      sku,
      qty,
      unitPrice: r() < 0.05 ? 0 : r() < 0.03 ? -int(1, 100) : int(1, 5000),
      date,
      status: pick(STATUS),
    });
  }
  const ym = (k) => `${2024 + Math.floor((startM - 1 + k) / 12)}-${pad(((startM - 1 + k) % 12) + 1)}`;
  const optsList = [
    {},
    { topN: 0 },
    { topN: 1 },
    { topN: 10 },
    { topN: undefined },
    { from: ym(1) },
    { to: ym(1) },
    { from: ym(1), to: ym(2) },
    { from: ym(2), to: ym(1) }, // khoảng rỗng
    { from: ym(0), to: ym(0) }, // biên một tháng
    { from: '2099-01' },
    { to: '1999-01' },
    { from: '', to: '' },
    { topN: 2, from: ym(0), to: ym(months) },
  ];
  return { orders, products, optsList };
}

function same(orders, products, opts, label) {
  const a = buildReport(orders, products, opts);
  const b = buildReportLegacy(orders, products, opts);
  assert.deepStrictEqual(a, b, label);
  assert.equal(JSON.stringify(a), JSON.stringify(b), label + ' (JSON)');
}

test('fuzz: 300 bộ dữ liệu seed cố định giống hệt bản cũ', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const { orders, products, optsList } = genCase(seed);
    // rút gọn thời gian chạy: bản cũ chậm; mỗi seed 3 bộ options xoay vòng, đủ 14 bộ trên toàn dải seed
    for (let k = 0; k < 3; k++) {
      const i = (seed * 3 + k) % optsList.length;
      same(orders, products, optsList[i], `seed ${seed} opts#${i}`);
    }
    same(orders, products, {}, `seed ${seed} opts#default`);
  }
});

test('fuzz: trường hợp biên cố định', () => {
  const P = [{ sku: 'A', name: 'x', category: 'K' }, { sku: 'A', name: 'y', category: 'Z' }, { sku: 'B', name: 'b', category: 'K' }];
  const O = (o) => ({ id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 10, date: '2025-01-01T00:00:00Z', status: 'paid', ...o });
  const cases = [
    [[], P],
    [[], []],
    [[O({})], []],
    [[O({ qty: 0, status: 'refunded' }), O({ qty: 0 })], P],
    [[O({ qty: -3 }), O({ qty: -3, status: 'refunded' })], P],
    [[O({ id: 1 }), O({ id: '1', customerId: 1 }), O({ customerId: '1' })], P],
    [[O({ date: '2025-01-31T23:00:00-05:00' }), O({ date: '2025-02-01T01:00:00+14:00' })], P],
    [[O({ status: 'cancelled' })], P],
    [[O({ unitPrice: 0 }), O({ sku: 'B', unitPrice: 0, status: 'refunded' })], P],
  ];
  for (const [o, p] of cases) for (const opt of [{}, { topN: 0 }, { from: '2025-01', to: '2025-01' }, { from: '2025-02' }]) same(o, p, opt, JSON.stringify(o));
});

test('fuzz: date không hợp lệ ném cùng loại lỗi', () => {
  const P = [{ sku: 'A', name: 'x', category: 'K' }];
  const base = { id: 1, customerId: 'c', sku: 'A', qty: 1, unitPrice: 10, status: 'paid' };
  for (const date of ['không phải ngày', '', '2025-13-45', 'xyz']) {
    for (const status of ['paid', 'cancelled']) {
      const orders = [{ ...base, date: '2025-01-01T00:00:00Z' }, { ...base, date, status }];
      let ea, eb;
      try { buildReport(orders, P); } catch (e) { ea = e; }
      try { buildReportLegacy(orders, P); } catch (e) { eb = e; }
      assert.ok(eb, 'bản cũ phải ném lỗi');
      assert.ok(ea, 'bản mới phải ném lỗi');
      assert.equal(ea.constructor, eb.constructor);
      assert.equal(ea.name, eb.name);
    }
  }
});
