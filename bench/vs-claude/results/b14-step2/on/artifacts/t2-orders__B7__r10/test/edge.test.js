'use strict';
// Test khóa các hành vi vốn đúng — không được hỏng sau khi sửa 6 lỗi trong ISSUES.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../src');
const { Catalog, Inventory, Cart, computeTotals, OutOfStockError, PromotionError } = api;
const { toCents, fromCents, formatMoney, allocate } = require('../src/money');
const { freeUnits, checkValidity } = require('../src/promotions');
const { lineTax } = require('../src/tax');

const PRODUCTS = [
  { sku: 'A', name: 'a', price: 10, category: 'x' },
  { sku: 'B', name: 'b', price: 10, category: 'y', taxClass: 'reduced' },
  { sku: 'C', name: 'c', price: 10, category: 'x', taxClass: 'zero' },
];

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, products = PRODUCTS) {
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(products), inv, promos), inv };
}

// ---- money ----
test('toCents: số xu thông thường', () => {
  assert.equal(toCents(2.5), 250);
  assert.equal(toCents(0.01), 1);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(-2.5), -250);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(100), 10000);
});

test('toCents: đầu vào không hợp lệ ném TypeError', () => {
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents(Infinity), TypeError);
  assert.throws(() => toCents('1'), TypeError);
});

test('fromCents / formatMoney', () => {
  assert.equal(fromCents(1234), 12.34);
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(0), '0.00');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(-5), '-0.05');
  assert.equal(formatMoney(100000000), '1,000,000.00');
});

test('allocate: chia chẵn và tổng bảo toàn', () => {
  assert.deepEqual(allocate(900, [1, 1, 1]), [300, 300, 300]);
  assert.deepEqual(allocate(100, [1, 3]), [25, 75]);
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(10, [0, 1]), [0, 10]);
});

// ---- promotions ----
test('freeUnits: mua N tặng M các trường hợp đúng', () => {
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 1), 1);
  assert.equal(freeUnits(10, 1, 1), 5);
});

test('checkValidity: endsAt trước ngày kết thúc còn hiệu lực', () => {
  const p = { code: 'P', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-29T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-01T00:00:00Z'), 0));
});

test('checkValidity: startsAt và minSubtotal', () => {
  const p = { code: 'P', startsAt: '2026-11-10', minSubtotal: 20 };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59Z'), 5000), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 2000));
  assert.throws(() => checkValidity(p, new Date('2026-11-11T00:00:00Z'), 1999), /giá trị tối thiểu/);
});

test('endsAt đã qua nhiều ngày bị từ chối', () => {
  const p = { code: 'P', endsAt: '2026-11-30' };
  assert.throws(() => checkValidity(p, new Date('2026-12-05T00:00:00Z'), 0), PromotionError);
});

test('applyCoupon: mã không tồn tại, không phân biệt hoa thường', () => {
  const { cart } = setup([{ code: 'Save', type: 'percent', percent: 10 }]);
  assert.throws(() => cart.applyCoupon('nope'), PromotionError);
  assert.equal(cart.applyCoupon('save').code, 'Save');
  cart.removeCoupon();
  assert.equal(cart.coupon, null);
});

// ---- checkout ----
test('checkout: hình dạng kết quả và thuế khi không có giảm giá', () => {
  const { cart } = setup();
  cart.addItem('A', 1); // 1000, thuế 10% = 100
  cart.addItem('B', 2); // 2000, thuế 5% = 100
  cart.addItem('C', 1); // 1000, thuế 0
  const t = computeTotals(cart);
  assert.deepEqual(Object.keys(t), ['lines', 'subtotal', 'discount', 'tax', 'total']);
  assert.deepEqual(Object.keys(t.lines[0]), ['sku', 'qty', 'unitPrice', 'gross', 'discount', 'net', 'tax']);
  assert.deepEqual(t.lines.map((l) => l.tax), [100, 100, 0]);
  assert.deepEqual(t.lines[1], { sku: 'B', qty: 2, unitPrice: 1000, gross: 2000, discount: 0, net: 2000, tax: 100 });
  assert.equal(t.subtotal, 4000);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 200);
  assert.equal(t.total, 4200);
});

test('checkout: giỏ rỗng', () => {
  const { cart } = setup();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test('checkout: mã giảm theo danh mục chỉ áp cho dòng thuộc danh mục', () => {
  const { cart } = setup([{ code: 'CAT', type: 'category', category: 'x', percent: 20 }]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.applyCoupon('CAT');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].discount, 200);
  assert.equal(t.lines[0].net, 800);
  assert.equal(t.lines[1].discount, 0);
  assert.equal(t.lines[1].net, 1000);
  assert.equal(t.discount, 200);
  assert.equal(t.subtotal, 2000);
});

test('checkout: giảm % chia chẵn giữa các dòng bằng nhau', () => {
  const { cart } = setup([{ code: 'P10', type: 'percent', percent: 10 }]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('P10');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [100, 100, 100]);
  assert.equal(t.discount, 300);
});

test('checkout: giảm cố định chia chẵn và không làm giỏ âm', () => {
  const { cart } = setup([
    { code: 'F3', type: 'fixed', amount: 3 },
    { code: 'F99', type: 'fixed', amount: 99 },
  ]);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F3');
  assert.deepEqual(computeTotals(cart).lines.map((l) => l.discount), [100, 100, 100]);
  cart.applyCoupon('F99');
  const t = computeTotals(cart);
  assert.equal(t.discount, 3000);
  assert.ok(t.lines.every((l) => l.net === 0 && l.tax === 0));
  assert.equal(t.total, 0);
});

test('checkout: mua 2 tặng 1 với 3 hộp — hộp tặng giá 0', () => {
  const { cart } = setup([{ code: 'B2G1', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 3);
  cart.addItem('B', 1);
  cart.applyCoupon('B2G1');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].discount, 1000);
  assert.equal(t.lines[0].net, 2000);
  assert.equal(t.lines[1].discount, 0);
  assert.equal(t.discount, 1000);
});

// ---- cart / inventory ----
test('cart: addItem giữ chỗ, kiểm tra đầu vào và hết hàng', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  assert.equal(inv.reserved.get('A'), 2);
  assert.equal(inv.available('A'), 2);
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 1.5), RangeError);
  assert.throws(() => cart.addItem('ZZ', 1), /Không có sản phẩm/);
  assert.throws(() => cart.addItem('A', 3), OutOfStockError);
  assert.equal(inv.reserved.get('A'), 2); // thêm thất bại không đổi giữ chỗ
  assert.equal(cart.lines.get('A'), 2);
});

test('cart: updateQty giảm số lượng và về 0', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 3);
  cart.updateQty('A', 1);
  assert.equal(cart.lines.get('A'), 1);
  assert.equal(inv.reserved.get('A'), 1);
  cart.updateQty('A', 0);
  assert.equal(cart.lines.has('A'), false);
  assert.equal(inv.reserved.get('A') ?? 0, 0);
});

test('cart: updateQty đầu vào sai', () => {
  const { cart } = setup();
  assert.throws(() => cart.updateQty('A', 1), /Giỏ không có/);
  cart.addItem('A', 1);
  assert.throws(() => cart.updateQty('A', -1), RangeError);
  assert.throws(() => cart.updateQty('A', 1.5), RangeError);
});

test('cart: updateQty vượt tồn kho báo hết hàng và giữ nguyên số lượng', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(cart.lines.get('A'), 2);
  assert.equal(inv.reserved.get('A'), 2);
});

test('cart: removeItem giỏ bình thường và món không có trong giỏ', () => {
  const { cart, inv } = setup([], { A: 4, B: 4 });
  cart.addItem('A', 1);
  cart.addItem('B', 2);
  cart.removeItem('A');
  assert.equal(cart.lines.has('A'), false);
  assert.equal(inv.available('A'), 4);
  assert.equal(inv.reserved.get('B'), 2);
  assert.doesNotThrow(() => cart.removeItem('nope'));
});

test('cart: subtotalCents và items', () => {
  const { cart } = setup();
  cart.addItem('A', 2);
  cart.addItem('B', 1);
  assert.equal(cart.subtotalCents(), 3000);
  assert.deepEqual(cart.items().map((i) => [i.sku, i.qty]), [['A', 2], ['B', 1]]);
});

test('inventory: available/reserve/release', () => {
  const inv = new Inventory({ A: 3 });
  assert.equal(inv.available('A'), 3);
  assert.equal(inv.available('none'), 0);
  inv.reserve('A', 3);
  assert.throws(() => inv.reserve('A', 1), (e) => e instanceof OutOfStockError && e.sku === 'A' && e.available === 0);
  inv.release('A', 2);
  assert.equal(inv.available('A'), 2);
  inv.release('A', 99);
  assert.equal(inv.available('A'), 3); // không âm
});

test('tax: lineTax theo loại thuế', () => {
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(1000, 'reduced'), 50);
  assert.equal(lineTax(1000, 'zero'), 0);
  assert.equal(lineTax(5, 'standard'), 1); // 0.5 làm tròn lên
  assert.throws(() => lineTax(1000, 'bogus'), /Loại thuế/);
});

test('API công khai không đổi', () => {
  for (const name of ['toCents', 'fromCents', 'formatMoney', 'allocate', 'Catalog', 'Inventory', 'OutOfStockError',
    'PromotionError', 'checkValidity', 'freeUnits', 'RATES', 'lineTax', 'Cart', 'computeTotals']) {
    assert.ok(name in api, `thiếu export ${name}`);
  }
  const { cart } = setup();
  for (const m of ['addItem', 'updateQty', 'removeItem', 'items', 'subtotalCents', 'applyCoupon', 'removeCoupon']) {
    assert.equal(typeof cart[m], 'function');
  }
});
