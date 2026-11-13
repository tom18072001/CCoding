'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate, formatMoney } = require('../src/money');
const { PromotionError } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 10, category: 'x', taxClass: 'standard' },
    { sku: 'B', name: 'b', price: 20, category: 'y', taxClass: 'reduced' },
    { sku: 'C', name: 'c', price: 5, category: 'x', taxClass: 'zero' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('giỏ rỗng: mọi tổng bằng 0', () => {
  const { cart } = setup();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test('tổng tiền bình thường, không giảm giá, thuế trên giá gốc', () => {
  const { cart } = setup();
  cart.addItem('A', 2); cart.addItem('B'); cart.addItem('C', 2);
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 5000);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 300);
  assert.equal(t.total, 5300);
  assert.deepEqual(t.lines[0], { sku: 'A', qty: 2, unitPrice: 1000, gross: 2000, discount: 0, net: 2000, tax: 200 });
});

test('giảm giá % chia hết', () => {
  const { cart } = setup([{ code: 'P10', type: 'percent', percent: 10 }]);
  cart.addItem('A', 2); cart.addItem('B');
  cart.applyCoupon('p10');
  const t = computeTotals(cart);
  assert.equal(t.discount, 400);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 200]);
  assert.equal(t.total, t.subtotal - t.discount + t.tax);
});

test('giảm theo danh mục chỉ áp dụng cho dòng cùng danh mục', () => {
  const { cart } = setup([{ code: 'CAT', type: 'category', category: 'x', percent: 50 }]);
  cart.addItem('A', 2); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('CAT');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [1000, 0, 250]);
  assert.equal(t.discount, 1250);
});

test('giảm cố định không làm giỏ âm', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 100 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.total, 0);
});

test('mua 2 tặng 1 trên giỏ thông thường', () => {
  const { cart } = setup([{ code: 'B2G1', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 3);
  cart.applyCoupon('B2G1');
  assert.equal(computeTotals(cart).discount, 1000);
});

test('allocate với số chia hết', () => {
  assert.deepEqual(allocate(900, [1, 1, 1]), [300, 300, 300]);
  assert.deepEqual(allocate(1000, [1, 3]), [250, 750]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
});

test('toCents và formatMoney giá trị thông thường', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(5), 500);
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
});

test('giữ chỗ tồn kho khi thêm và gỡ item thông thường', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 3);
  cart.addItem('A', 2);
  assert.equal(inv.available('A'), 5);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 10);
  cart.addItem('B', 4);
  cart.updateQty('B', 0);
  assert.equal(inv.available('B'), 10);
  assert.equal(cart.items().length, 0);
});

test('thêm vượt tồn kho báo lỗi và không giữ chỗ', () => {
  const { cart, inv } = setup([], { A: 2 });
  assert.throws(() => cart.addItem('A', 3), { name: 'OutOfStockError' });
  assert.equal(inv.available('A'), 2);
  assert.throws(() => cart.addItem('A', 0), RangeError);
});

test('khuyến mãi chưa hết hạn và trong khoảng hiệu lực', () => {
  const { cart } = setup([{ code: 'OK', type: 'percent', percent: 10, startsAt: '2026-01-01', endsAt: '2026-12-31' }]);
  cart.addItem('A');
  assert.equal(cart.applyCoupon('OK', new Date('2026-06-15T12:00:00Z')).code, 'OK');
  assert.throws(() => cart.applyCoupon('OK', new Date('2025-12-31T23:59:59Z')), PromotionError);
  assert.throws(() => cart.applyCoupon('OK', new Date('2027-02-01T00:00:00Z')), PromotionError);
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
});

test('minSubtotal bị từ chối khi chưa đạt, chấp nhận khi đạt', () => {
  const { cart } = setup([{ code: 'MIN', type: 'percent', percent: 10, minSubtotal: 25 }]);
  cart.addItem('A', 2);
  assert.throws(() => cart.applyCoupon('MIN'), PromotionError);
  cart.addItem('A');
  assert.equal(cart.applyCoupon('MIN').code, 'MIN');
});
