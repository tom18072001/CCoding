'use strict';
// Bảo vệ các hành vi đang đúng — phải giữ nguyên sau khi sửa lỗi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, OutOfStockError, PromotionError } = require('../src');
const { toCents, allocate, formatMoney } = require('../src/money');
const { freeUnits } = require('../src/promotions');

const P = [
  { sku: 'A', name: 'a', price: 10, category: 'food' },
  { sku: 'B', name: 'b', price: 20, category: 'toy', taxClass: 'reduced' },
  { sku: 'Z', name: 'z', price: 5, category: 'toy', taxClass: 'zero' },
];
function setup(promos = [], stock = { A: 10, B: 10, Z: 10 }) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(P), inv, promos), inv };
}

test('toCents số dương thông thường', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(10), 1000);
  assert.equal(toCents(0.5), 50);
  assert.equal(toCents(19.99), 1999);
});

test('allocate khi chia hết', () => {
  assert.deepEqual(allocate(900, [1, 1, 1]), [300, 300, 300]);
  assert.deepEqual(allocate(1000, [1, 3]), [250, 750]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(5), '0.05');
});

test('mã phần trăm', () => {
  const { cart } = setup([{ code: 'P10', type: 'percent', percent: 10 }]);
  cart.addItem('A', 2); // 2000
  cart.addItem('B', 1); // 2000
  cart.applyCoupon('p10'); // không phân biệt hoa thường
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 4000);
  assert.equal(t.discount, 400);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 200]);
  assert.equal(t.tax, 180 + 90); // 10% của 1800, 5% của 1800
  assert.equal(t.total, 3600 + 270);
});

test('mã theo danh mục', () => {
  const { cart } = setup([{ code: 'TOY', type: 'category', category: 'toy', percent: 50 }]);
  cart.addItem('A');
  cart.addItem('B');
  cart.applyCoupon('TOY');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [0, 1000]);
  assert.equal(t.discount, 1000);
});

test('minSubtotal ở mức bình thường', () => {
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 25 }]);
  cart.addItem('A', 2);
  assert.throws(() => cart.applyCoupon('M'), PromotionError);
  assert.equal(cart.coupon, null);
  cart.addItem('A', 1); // 30.00 >= 25
  cart.applyCoupon('M');
  assert.equal(cart.coupon.code, 'M');
});

test('mã không tồn tại báo PromotionError', () => {
  const { cart } = setup();
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
});

test('mua X tặng Y khi qty chia hết', () => {
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(1, 2, 1), 0);
  const { cart } = setup([{ code: 'B2G1', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 6);
  cart.applyCoupon('B2G1');
  const t = computeTotals(cart);
  assert.equal(t.discount, 2000);
  assert.equal(t.total, 4000 + 400);
});

test('mã còn hạn trước endsAt và chưa tới startsAt', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, startsAt: '2026-01-10', endsAt: '2026-01-20' }]);
  cart.addItem('A');
  assert.throws(() => cart.applyCoupon('E', new Date('2026-01-09T12:00:00Z')), PromotionError);
  cart.applyCoupon('E', new Date('2026-01-15T12:00:00Z'));
  assert.equal(cart.coupon.code, 'E');
  cart.removeCoupon();
  assert.equal(cart.coupon, null);
  assert.throws(() => cart.applyCoupon('E', new Date('2026-02-01T00:00:00Z')), PromotionError);
});

test('giữ chỗ kho khi thêm hàng và báo lỗi khi vượt tồn', () => {
  const { cart, inv } = setup([], { A: 5 });
  cart.addItem('A', 2);
  cart.addItem('A', 1);
  assert.equal(inv.available('A'), 2);
  assert.equal(cart.lines.get('A'), 3);
  assert.throws(() => cart.addItem('A', 3), OutOfStockError);
  assert.equal(inv.available('A'), 2);
  assert.equal(cart.lines.get('A'), 3);
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('NOPE'), /Không có sản phẩm/);
});

test('tổng tiền giỏ trống và một dòng', () => {
  const { cart } = setup();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
  cart.addItem('A', 3);
  assert.deepEqual(computeTotals(cart), {
    lines: [{ sku: 'A', qty: 3, unitPrice: 1000, gross: 3000, discount: 0, net: 3000, tax: 300 }],
    subtotal: 3000, discount: 0, tax: 300, total: 3300,
  });
});
