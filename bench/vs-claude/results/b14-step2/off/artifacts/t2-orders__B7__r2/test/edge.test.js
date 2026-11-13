'use strict';
// Test bảo vệ các hành vi vốn đúng và các trường hợp biên.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate, formatMoney } = require('../src/money');
const { freeUnits, checkValidity, PromotionError } = require('../src/promotions');
const { OutOfStockError } = require('../src/inventory');

function mk(promos = [], stock = { A: 10, B: 10, C: 10 }) {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 10, category: 'x' },
    { sku: 'B', name: 'b', price: 5, category: 'x' },
    { sku: 'C', name: 'c', price: 20, category: 'y', taxClass: 'zero' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('allocate: tổng chia hết, không có phần dư', () => {
  assert.deepEqual(allocate(900, [1, 1, 1]), [300, 300, 300]);
  assert.deepEqual(allocate(100, [1, 4]), [20, 80]);
  assert.deepEqual(allocate(100, [50]), [100]);
});

test('allocate: tỉ lệ bằng nhau, phần dư cho phần đứng trước', () => {
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(1, [5, 5]), [1, 0]);
});

test('allocate: total 0 và số lượng nhỏ', () => {
  assert.deepEqual(allocate(0, [1, 2, 3]), [0, 0, 0]);
  assert.deepEqual(allocate(1, [1]), [1]);
  assert.deepEqual(allocate(1, [1, 2]), [0, 1]);
  assert.deepEqual(allocate(3, [0, 1, 0]), [0, 3, 0]);
  for (const [t, w] of [[7, [1, 2, 3]], [1, [3, 3, 3]], [13, [10, 20, 30, 40]]]) {
    assert.equal(sum(allocate(t, w)), t);
  }
});

test('toCents: âm, 0, số nguyên, số thông thường', () => {
  assert.equal(toCents(-12.34), -1234);
  assert.equal(toCents(-5), -500);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(7), 700);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents('1'), TypeError);
});

test('formatMoney: nghìn, hai chữ số thập phân, âm', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(-100), '-1.00');
});

test('mã giảm cố định: trừ đúng số tiền và không làm giỏ âm', () => {
  const { cart } = mk([{ code: 'F5', type: 'fixed', amount: 5 }, { code: 'BIG', type: 'fixed', amount: 1000 }]);
  cart.addItem('A', 2); // 2000
  cart.addItem('B', 2); // 1000
  cart.applyCoupon('F5');
  let t = computeTotals(cart);
  assert.equal(t.subtotal, 3000);
  assert.equal(t.discount, 500);
  assert.equal(sum(t.lines.map((l) => l.discount)), 500);
  assert.equal(t.lines[0].discount, 333);
  assert.equal(t.lines[1].discount, 167);
  cart.applyCoupon('BIG');
  t = computeTotals(cart);
  assert.equal(t.discount, 3000);
  assert.equal(t.total, 0);
});

test('mã giảm %: tổng giảm đúng và chia khớp các dòng', () => {
  const { cart } = mk([{ code: 'P10', type: 'percent', percent: 10 }]);
  cart.addItem('A', 2); // 2000
  cart.addItem('B', 2); // 1000
  cart.applyCoupon('P10');
  const t = computeTotals(cart);
  assert.equal(t.discount, 300);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 100]);
  assert.equal(t.lines[0].net, 1800);
});

test('mã còn hạn trước ngày endsAt, đúng ngày endsAt, và chưa tới startsAt', () => {
  const promo = { code: 'X', type: 'percent', percent: 5, startsAt: '2026-06-01', endsAt: '2026-06-30' };
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-06-15T12:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-06-01T00:00:00Z'), 0));
  assert.throws(() => checkValidity(promo, new Date('2026-05-31T23:59:59Z'), 0), PromotionError);
  assert.throws(() => checkValidity(promo, new Date('2026-07-02T00:00:00Z'), 0), PromotionError);
});

test('minSubtotal và mã không tồn tại', () => {
  const { cart } = mk([{ code: 'M', type: 'percent', percent: 5, minSubtotal: 50 }]);
  cart.addItem('A', 1);
  assert.throws(() => cart.applyCoupon('M'), PromotionError);
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
  cart.addItem('A', 4); // 5000
  assert.equal(cart.applyCoupon('m').code, 'M');
});

test('freeUnits khi qty nhỏ hơn buy+free và khi đủ nhóm', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(5, 1, 1), 2);
});

test('bxgy: qty nhỏ hơn buy+free không giảm giá', () => {
  const { cart } = mk([{ code: 'B2G1', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 2);
  cart.applyCoupon('B2G1');
  assert.equal(computeTotals(cart).discount, 0);
  cart.addItem('A', 1);
  assert.equal(computeTotals(cart).discount, 1000);
});

test('mã theo danh mục chỉ giảm dòng thuộc danh mục', () => {
  const { cart } = mk([{ code: 'CAT', type: 'category', category: 'y', percent: 50 }]);
  cart.addItem('A', 1);
  cart.addItem('C', 1);
  cart.applyCoupon('CAT');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [0, 1000]);
});

test('thuế khi không có giảm giá: theo loại thuế, làm tròn từng dòng', () => {
  const { cart } = mk();
  cart.addItem('A', 3); // 3000, standard 10%
  cart.addItem('C', 1); // 2000, zero
  const t = computeTotals(cart);
  assert.equal(t.lines[0].tax, 300);
  assert.equal(t.lines[1].tax, 0);
  assert.equal(t.subtotal, 5000);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 300);
  assert.equal(t.total, 5300);
});

test('giỏ rỗng cho tổng bằng 0', () => {
  const { cart } = mk();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test('updateQty tăng và giảm trong tồn kho', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 2);
  cart.updateQty('A', 5);
  assert.equal(cart.lines.get('A'), 5);
  assert.equal(inv.available('A'), 5);
  cart.updateQty('A', 3);
  assert.equal(cart.lines.get('A'), 3);
  assert.equal(inv.available('A'), 7);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 7);
});

test('updateQty vượt tồn kho ném lỗi và không đổi trạng thái', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 4);
  assert.throws(() => cart.updateQty('A', 11), OutOfStockError);
  assert.equal(cart.lines.get('A'), 4);
  assert.equal(inv.available('A'), 6);
  cart.updateQty('A', 10); // đúng bằng tồn kho vẫn được
  assert.equal(inv.available('A'), 0);
});

test('updateQty: dòng không có, qty sai, qty 0 gỡ dòng', () => {
  const { cart, inv } = mk();
  assert.throws(() => cart.updateQty('A', 1), /Giỏ không có/);
  cart.addItem('A', 3);
  assert.throws(() => cart.updateQty('A', -1), RangeError);
  assert.throws(() => cart.updateQty('A', 1.5), RangeError);
  cart.updateQty('A', 0);
  assert.equal(cart.lines.has('A'), false);
  assert.equal(inv.available('A'), 10);
});

test('addItem: qty không hợp lệ và vượt tồn kho', () => {
  const { cart } = mk();
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 11), OutOfStockError);
  assert.throws(() => cart.addItem('ZZ', 1), /Không có sản phẩm/);
});

test('removeItem nhả giữ chỗ; dòng không tồn tại không lỗi và không đổi tồn kho', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(cart.lines.has('A'), false);
  assert.equal(inv.available('A'), 10);
  assert.doesNotThrow(() => cart.removeItem('B'));
  assert.doesNotThrow(() => cart.removeItem('A'));
  assert.equal(inv.available('A'), 10);
  assert.equal(inv.available('B'), 10);
});
