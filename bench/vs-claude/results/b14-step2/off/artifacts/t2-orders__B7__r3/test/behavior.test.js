'use strict';
// Bảo vệ các hành vi đang đúng (non-regression).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, PromotionError, OutOfStockError } = require('../src');
const { allocate, toCents, formatMoney } = require('../src/money');
const { lineTax, RATES } = require('../src/tax');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.34, category: 'y' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}
function full(promos) {
  const s = setup(promos);
  s.cart.addItem('A');
  s.cart.addItem('B');
  s.cart.addItem('C');
  return s;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('toCents: giá trị thường và âm', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(-12.34), -1234);
  assert.equal(toCents(10), 1000);
  assert.ok(!Object.is(toCents(-0.001), -0));
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(-1234), '-12.34');
});

test('giảm % toàn giỏ: tổng giảm đúng và net = gross - discount', () => {
  const { cart } = full([{ code: 'P10', type: 'percent', percent: 10 }]);
  cart.applyCoupon('p10');
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 1000);
  assert.equal(t.discount, 100);
  assert.deepEqual(t.lines.map((l) => l.discount), [33, 33, 34]);
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
});

test('giảm theo danh mục chỉ áp cho dòng thuộc danh mục', () => {
  const { cart } = full([{ code: 'CAT', type: 'category', category: 'x', percent: 50 }]);
  cart.applyCoupon('CAT');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [167, 167, 0]);
  assert.equal(t.discount, 334);
});

test('mã giảm cố định bằng tổng thì net = 0, vượt tổng thì không âm', () => {
  for (const amount of [10, 20]) {
    const { cart } = full([{ code: 'F', type: 'fixed', amount }]);
    cart.applyCoupon('F');
    const t = computeTotals(cart);
    assert.equal(t.discount, 1000);
    assert.equal(t.total, 0);
    assert.ok(t.lines.every((l) => l.net >= 0));
  }
});

test('mã giảm cố định nhỏ hơn tổng', () => {
  const { cart } = full([{ code: 'F', type: 'fixed', amount: 5 }]);
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 500);
  assert.equal(t.total, 500 + t.tax);
});

test('minSubtotal: đúng bằng ngưỡng được, thấp hơn bị từ chối', () => {
  const ok = full([{ code: 'M', type: 'percent', percent: 5, minSubtotal: 10 }]);
  assert.doesNotThrow(() => ok.cart.applyCoupon('M'));
  const bad = full([{ code: 'M', type: 'percent', percent: 5, minSubtotal: 10.01 }]);
  assert.throws(() => bad.cart.applyCoupon('M'), PromotionError);
});

test('mã không tồn tại bị từ chối; chỉ giữ một mã (mã sau thay mã trước)', () => {
  const { cart } = full([
    { code: 'P10', type: 'percent', percent: 10 },
    { code: 'P50', type: 'percent', percent: 50 },
  ]);
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
  cart.applyCoupon('P10');
  cart.applyCoupon('P50');
  assert.equal(computeTotals(cart).discount, 500);
  cart.removeCoupon();
  assert.equal(computeTotals(cart).discount, 0);
});

test('allocate: tổng các phần luôn bằng total (kể cả âm, nhiều phần, trọng số 0)', () => {
  const cases = [
    [10, [1, 1, 1]],
    [1, [1, 1, 1, 1, 1, 1, 1]],
    [100, [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    [999, [0, 5, 0, 7]],
    [0, [1, 2]],
    [-10, [1, 1, 1]],
    [-7, [1, 2, 4]],
    [-1000, [333, 333, 334]],
  ];
  for (const [total, w] of cases) assert.equal(sum(allocate(total, w)), total, `${total} / ${w}`);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocate(999, [0, 5, 0, 7]).filter((_, i) => i % 2 === 0), [0, 0]);
});

test('thuế các mức trong RATES', () => {
  assert.deepEqual(RATES, { standard: 0.1, reduced: 0.05, zero: 0 });
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(1000, 'reduced'), 50);
  assert.equal(lineTax(1000, 'zero'), 0);
  assert.equal(lineTax(1010, 'reduced'), 51); // 50.5 → half up
  assert.equal(lineTax(1005, 'reduced'), 50); // 50.25
  assert.equal(lineTax(0, 'standard'), 0);
  assert.throws(() => lineTax(100, 'bogus'));
});

test('computeTotals không mã: total = subtotal + tax, thuế theo loại của từng sản phẩm', () => {
  const catalog = new Catalog([
    { sku: 'S', name: 'S', price: 10, category: 'x' },
    { sku: 'R', name: 'R', price: 10, category: 'x', taxClass: 'reduced' },
    { sku: 'Z', name: 'Z', price: 10, category: 'x', taxClass: 'zero' },
  ]);
  const cart = new Cart(catalog, new Inventory({ S: 5, R: 5, Z: 5 }));
  cart.addItem('S', 2);
  cart.addItem('R');
  cart.addItem('Z');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.tax), [200, 50, 0]);
  assert.equal(t.subtotal, 4000);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 250);
  assert.equal(t.total, 4250);
});

test('giữ chỗ tồn kho: thêm, tăng, giảm, xóa', () => {
  const { cart, inv } = setup([], { A: 4, B: 10, C: 10 });
  cart.addItem('A', 2);
  assert.equal(inv.reserved.get('A'), 2);
  cart.addItem('A', 1);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 4);
  assert.equal(inv.reserved.get('A'), 4);
  assert.equal(inv.available('A'), 0);
  cart.updateQty('A', 1);
  assert.equal(inv.reserved.get('A'), 1);
  cart.updateQty('A', 0);
  assert.equal(inv.reserved.get('A') ?? 0, 0);
  assert.equal(cart.items().length, 0);
});

test('hết hàng thật sự vẫn báo lỗi và không đổi trạng thái giữ chỗ', () => {
  const { cart, inv } = setup([], { A: 4, B: 10, C: 10 });
  cart.addItem('A', 3);
  assert.throws(() => cart.addItem('A', 2), OutOfStockError);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(cart.lines.get('A'), 3);
});

test('xóa khỏi giỏ nhả tồn kho cho giỏ khác; hai giỏ giữ chỗ độc lập', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory({ A: 4 });
  const c1 = new Cart(catalog, inv);
  const c2 = new Cart(catalog, inv);
  c1.addItem('A', 3);
  assert.throws(() => c2.addItem('A', 2), OutOfStockError);
  c1.removeItem('A');
  assert.equal(inv.available('A'), 4);
  c2.addItem('A', 4);
  assert.equal(inv.reserved.get('A'), 4);
  c1.removeItem('A'); // xóa món không có: không làm gì, không nhả nhầm của giỏ khác
  assert.equal(inv.reserved.get('A'), 4);
});

test('Cart kiểm tra đầu vào', () => {
  const { cart } = setup();
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 1.5), RangeError);
  assert.throws(() => cart.addItem('ZZ'));
  assert.throws(() => cart.updateQty('A', 1));
});

test('freeUnits các biên', () => {
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(1, 2, 1), 0);
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
  assert.equal(freeUnits(2, 1, 1), 1);
});

test('bxgy trong computeTotals: món tặng giá 0, chỉ đúng sku', () => {
  const { cart } = setup([{ code: 'B2G1', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 3);
  cart.addItem('B', 3);
  cart.applyCoupon('B2G1');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [333, 0]);
  assert.equal(t.discount, 333);
});

test('endsAt: dùng được tới hết ngày, từ chối từ 00:00Z ngày kế tiếp', () => {
  const { cart } = full([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-29T12:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T00:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), PromotionError);
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-02T00:00:00Z')), PromotionError);
});

test('startsAt: hiệu lực từ đầu ngày startsAt', () => {
  const { cart } = full([{ code: 'S', type: 'percent', percent: 10, startsAt: '2026-11-10' }]);
  assert.throws(() => cart.applyCoupon('S', new Date('2026-11-09T23:59:59Z')), PromotionError);
  assert.doesNotThrow(() => cart.applyCoupon('S', new Date('2026-11-10T00:00:00Z')));
});
