'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(promos = []) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const inv = new Inventory({ TEA: 10, MUG: 5 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('tính tiền không mã giảm giá', () => {
  const { cart } = setup();
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 1);
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 2250);
  assert.equal(t.tax, 50 + 125);
  assert.equal(t.total, 2250 + 175);
});

test('giữ chỗ tồn kho khi thêm', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  assert.equal(inv.available('MUG'), 3);
});

test('mã không tồn tại', () => {
  const { cart } = setup();
  assert.throws(() => cart.applyCoupon('NOPE'), /không tồn tại/);
});

const { checkValidity, freeUnits } = require('../src/promotions');

test('lỗi 2: tổng giảm giá khớp số tiền mã', () => {
  const catalog = new Catalog([1, 2, 3].map((n) => ({ sku: 'S' + n, name: 'x', price: 1, category: 'c' })));
  const promos = [{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 33 }];
  const cart = new Cart(catalog, new Inventory({ S1: 50, S2: 50, S3: 50 }), promos);
  ['S1', 'S2', 'S3'].forEach((s) => cart.addItem(s, 10));
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 1000);
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round(3000 * 0.33));
});

test('lỗi 3: mua X tặng Y', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('lỗi 4: endsAt dùng được hết ngày', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('lỗi 5: giữ chỗ tồn kho khớp tổng giỏ', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'a', price: 1, category: 'c' }]);
  const inv = new Inventory({ A: 4 });
  const cart = new Cart(catalog, inv);
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('lỗi 6: thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('MUG', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1250);
  assert.equal(t.tax, 125);
  assert.equal(t.total, 1375);
});

test('lỗi 5: hết hàng khi tăng quá tồn, giữ chỗ không đổi; xóa lặp an toàn; giỏ khác mua được', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'a', price: 1, category: 'c' }]);
  const inv = new Inventory({ A: 4 });
  const c1 = new Cart(catalog, inv);
  const c2 = new Cart(catalog, inv);
  c1.addItem('A', 2);
  c2.addItem('A', 1);
  assert.throws(() => c1.updateQty('A', 4), /Hết hàng/);
  assert.equal(inv.available('A'), 1);
  c1.updateQty('A', 2); // không đổi
  assert.equal(inv.available('A'), 1);
  c1.updateQty('A', 0);
  assert.equal(inv.available('A'), 3);
  c1.removeItem('A'); // lặp: không giải phóng thêm
  assert.equal(inv.available('A'), 3);
  c2.removeItem('A');
  assert.equal(inv.available('A'), 4);
  assert.doesNotThrow(() => c1.addItem('A', 4));
});

test('lỗi 1: mã giảm cố định 1.005 → 101 xu; lớn hơn tổng đơn thì chỉ giảm bằng tổng', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1.005 }, { code: 'BIG', type: 'fixed', amount: 999 }]);
  cart.addItem('TEA', 2);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 101);
  cart.applyCoupon('BIG');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.total, 0);
  assert.ok(t.lines.every((l) => l.net >= 0 && l.discount >= 0));
});

test('lỗi 6: thuế theo net với nhiều dòng khác thuế suất, thuế suất 0, giảm cố định', () => {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 10, category: 'c', taxClass: 'standard' },
    { sku: 'B', name: 'b', price: 10, category: 'c', taxClass: 'reduced' },
    { sku: 'C', name: 'c', price: 10, category: 'c', taxClass: 'zero' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 5, B: 5, C: 5 }), [{ code: 'F', type: 'fixed', amount: 6 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 200, 200]);
  assert.deepEqual(t.lines.map((l) => l.tax), [80, 40, 0]);
  assert.equal(t.total, 2400 + 120);
});

test('giữ nguyên: mã theo danh mục, bxgy, giỏ trống, không mã', () => {
  const { cart } = setup([{ code: 'D', type: 'category', category: 'drink', percent: 10 }]);
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 1);
  cart.applyCoupon('D');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [100, 0]);
  const empty = computeTotals(setup().cart);
  assert.deepEqual(empty, { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});
