'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../src');
const { toCents, fromCents, formatMoney, allocate, Catalog, Inventory, OutOfStockError, Cart, computeTotals, PromotionError } = lib;

// ── #1 làm tròn xu
for (const [x, c] of [[1.005, 101], [-1.005, -101], [2.675, 268], [8.345, 835], [1.255, 126], [0.29, 29], [12.34, 1234], [19.999, 2000], [0.1 + 0.2, 30], [123456.785, 12345679], [0.005, 1], [5, 500]]) {
  test(`#1 toCents(${x}) = ${c}`, () => assert.equal(toCents(x), c));
}
test('#1 toCents kiểu sai vẫn ném TypeError', () => {
  assert.throws(() => toCents('1.5'), TypeError);
  assert.throws(() => toCents(NaN), TypeError);
});
test('#1 giá sản phẩm 1.005 lưu thành 101 xu', () => {
  const c = new Catalog([{ sku: 'P', name: 'p', price: 1.005, category: 'x' }]);
  assert.equal(c.get('P').priceCents, 101);
});

function shop(promos = [], stock = {}) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
    { sku: 'PEN', name: 'Bút', price: 1.005, category: 'office' },
    { sku: 'A', name: 'A', price: 10, category: 'office', taxClass: 'zero' },
    { sku: 'B', name: 'B', price: 10, category: 'office', taxClass: 'zero' },
    { sku: 'C', name: 'C', price: 10, category: 'office', taxClass: 'zero' },
    { sku: 'BOX', name: 'Hộp', price: 3, category: 'food', taxClass: 'zero' },
  ]);
  const inv = new Inventory({ TEA: 50, MUG: 50, PEN: 50, A: 50, B: 50, C: 50, BOX: 50, ...stock });
  return { cart: new Cart(catalog, inv, promos), inv, catalog };
}
const NOW = new Date('2026-11-15T12:00:00Z');

test('#1 mã giảm cố định 1.005 → giảm 101 xu', () => {
  const { cart } = shop([{ code: 'F', type: 'fixed', amount: 1.005 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('F', NOW);
  assert.equal(computeTotals(cart).discount, 101);
});
test('#1 giá trị tối thiểu 10.005 so bằng xu đã làm tròn', () => {
  const promos = [{ code: 'MIN', type: 'percent', percent: 5, minSubtotal: 10.005 }];
  const a = shop(promos);
  a.cart.addItem('A', 1); // 1000 xu < 1001
  assert.throws(() => a.cart.applyCoupon('MIN', NOW), PromotionError);
  const b = shop(promos);
  b.cart.addItem('A', 1);
  b.cart.addItem('PEN', 1); // 1101 xu
  assert.doesNotThrow(() => b.cart.applyCoupon('MIN', NOW));
});

// ── #2 phân bổ giảm giá
for (const [total, w, exp] of [
  [1000, [1, 1, 1], [334, 333, 333]],
  [5, [3, 3, 3, 1], [2, 2, 1, 0]],
  [10, [2, 1], [7, 3]],
  [7, [0, 0], [0, 0]],
  [0, [5, 5], [0, 0]],
  [100, [1, 1], [50, 50]],
  [1, [1, 1, 1], [1, 0, 0]],
  [11, [1, 2, 3, 4], [1, 2, 3, 5]],
  [255, [1000, 1250, 303], [100, 125, 30]],
]) {
  test(`#2 allocate(${total}, [${w}]) = [${exp}]`, () => assert.deepEqual(allocate(total, w), exp));
}
test('#2 allocate: tổng luôn bằng total', () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const w = Array.from({ length: n }, () => Math.floor(rnd() * 5000));
    const total = Math.floor(rnd() * 100000);
    const r = allocate(total, w);
    if (w.some((x) => x > 0)) assert.equal(r.reduce((a, b) => a + b, 0), total);
    r.forEach((x) => assert.ok(Number.isInteger(x) && x >= 0));
  }
});
test('#2 mã cố định 10.00 trên 3 món: tổng giảm đúng 1000', () => {
  const { cart } = shop([{ code: 'TEN', type: 'fixed', amount: 10 }]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.addItem('C', 1);
  cart.applyCoupon('TEN', NOW);
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.deepEqual(t.lines.map((l) => l.discount), [334, 333, 333]);
  assert.equal(t.total, 2000);
});
test('#2 mã % : tổng giảm của các dòng bằng giảm của mã', () => {
  const { cart } = shop([{ code: 'P7', type: 'percent', percent: 7 }]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.addItem('C', 1);
  cart.applyCoupon('P7', NOW);
  const t = computeTotals(cart);
  assert.equal(t.discount, 210);
  assert.deepEqual(t.lines.map((l) => l.discount), [70, 70, 70]);
});
test('#2 mã cố định lớn hơn giỏ: không âm', () => {
  const { cart } = shop([{ code: 'BIG', type: 'fixed', amount: 100 }]);
  cart.addItem('A', 1);
  cart.addItem('BOX', 1);
  cart.applyCoupon('BIG', NOW);
  const t = computeTotals(cart);
  assert.equal(t.discount, 1300);
  assert.equal(t.total, 0);
});

// ── #3 mua X tặng Y
for (const [buy, free, qty, exp] of [[2, 1, 1, 0], [2, 1, 2, 0], [2, 1, 3, 1], [2, 1, 5, 1], [2, 1, 6, 2], [3, 2, 4, 0], [3, 2, 5, 2], [3, 2, 10, 4], [1, 1, 7, 3]]) {
  test(`#3 mua ${buy} tặng ${free}, ${qty} món → ${exp} miễn phí`, () => {
    const { cart } = shop([{ code: 'G', type: 'bxgy', sku: 'BOX', buy, free }]);
    cart.addItem('BOX', qty);
    cart.applyCoupon('G', NOW);
    const t = computeTotals(cart);
    assert.equal(t.discount, exp * 300);
    assert.equal(t.total, (qty - exp) * 300);
  });
}
test('#3 bxgy không áp cho sản phẩm khác', () => {
  const { cart } = shop([{ code: 'G', type: 'bxgy', sku: 'BOX', buy: 2, free: 1 }]);
  cart.addItem('A', 3);
  cart.applyCoupon('G', NOW);
  assert.equal(computeTotals(cart).discount, 0);
});

// ── #4 hiệu lực mã (UTC, tới hết ngày endsAt)
const window = [{ code: 'NOV', type: 'percent', percent: 10, startsAt: '2026-11-01', endsAt: '2026-11-30' }];
for (const [at, ok] of [
  ['2026-11-30T10:00:00Z', true],
  ['2026-11-30T23:59:59.999Z', true],
  ['2026-12-01T00:00:00Z', false],
  ['2026-12-05T00:00:00Z', false],
  ['2026-11-01T00:00:00Z', true],
  ['2026-10-31T23:59:59.999Z', false],
  ['2026-11-15T08:00:00Z', true],
]) {
  test(`#4 mã NOV lúc ${at} → ${ok ? 'nhận' : 'từ chối'}`, () => {
    const { cart } = shop(window);
    cart.addItem('A', 1);
    if (ok) assert.doesNotThrow(() => cart.applyCoupon('nov', new Date(at)));
    else assert.throws(() => cart.applyCoupon('NOV', new Date(at)), PromotionError);
  });
}

// ── #5 giữ chỗ tồn kho
test('#5 sửa số lượng 2 → 3 khi kho còn 4', () => {
  const { cart, inv } = shop([], { MUG: 4 });
  cart.addItem('MUG', 2);
  assert.doesNotThrow(() => cart.updateQty('MUG', 3));
  assert.equal(inv.available('MUG'), 1);
});
test('#5 giảm số lượng trả lại kho', () => {
  const { cart, inv } = shop([], { MUG: 4 });
  cart.addItem('MUG', 3);
  cart.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 3);
});
test('#5 xóa món trả lại kho', () => {
  const { cart, inv } = shop([], { MUG: 4 });
  cart.addItem('MUG', 4);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 4);
});
test('#5 updateQty 0 = xóa và trả kho', () => {
  const { cart, inv } = shop([], { MUG: 4 });
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 4);
  assert.equal(cart.items().length, 0);
});
test('#5 hai giỏ dùng chung kho: đang giữ = tổng số lượng các giỏ', () => {
  const catalog = new Catalog([{ sku: 'X', name: 'x', price: 1, category: 'c' }]);
  const inv = new Inventory({ X: 5 });
  const c1 = new Cart(catalog, inv);
  const c2 = new Cart(catalog, inv);
  c1.addItem('X', 2);
  c2.addItem('X', 2);
  c1.updateQty('X', 3);
  assert.equal(inv.available('X'), 0);
  assert.throws(() => c2.updateQty('X', 3), OutOfStockError);
  assert.equal(inv.available('X'), 0);
  c1.removeItem('X');
  assert.doesNotThrow(() => c2.updateQty('X', 5));
  assert.equal(inv.available('X'), 0);
});
test('#5 tăng vượt kho: báo lỗi và không đổi giỏ/kho', () => {
  const { cart, inv } = shop([], { MUG: 4 });
  cart.addItem('MUG', 2);
  assert.throws(() => cart.updateQty('MUG', 5), (e) => e instanceof OutOfStockError);
  assert.equal(cart.items()[0].qty, 2);
  assert.equal(inv.available('MUG'), 2);
});
test('#5 thêm vượt kho vẫn báo OutOfStockError có số còn lại', () => {
  const { cart } = shop([], { MUG: 1 });
  assert.throws(() => cart.addItem('MUG', 2), (e) => e instanceof OutOfStockError && e.available === 1 && e.requested === 2);
});

// ── #6 thuế trên giá sau giảm
test('#6 thuế tính trên net', () => {
  const { cart } = shop([{ code: 'P10', type: 'percent', percent: 10 }]);
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 1);
  cart.addItem('PEN', 3);
  cart.applyCoupon('P10', NOW);
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => [l.sku, l.gross, l.discount, l.net, l.tax]), [
    ['TEA', 1000, 100, 900, 45],
    ['MUG', 1250, 125, 1125, 113],
    ['PEN', 303, 30, 273, 27],
  ]);
  assert.equal(t.subtotal, 2553);
  assert.equal(t.discount, 255);
  assert.equal(t.tax, 185);
  assert.equal(t.total, 2483);
});
test('#6 thuế trên net với giảm theo danh mục', () => {
  const { cart } = shop([{ code: 'HOME', type: 'category', category: 'home', percent: 20 }]);
  cart.addItem('MUG', 2);
  cart.addItem('TEA', 1);
  cart.applyCoupon('HOME', NOW);
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => [l.sku, l.discount, l.net, l.tax]), [['MUG', 500, 2000, 200], ['TEA', 0, 500, 25]]);
  assert.equal(t.total, 2725);
});

// ── hành vi đang đúng (hồi quy)
test('hồi quy: không mã', () => {
  const { cart } = shop();
  cart.addItem('TEA', 2);
  cart.addItem('MUG', 1);
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 2250);
  assert.equal(t.tax, 175);
  assert.equal(t.total, 2425);
  assert.deepEqual(Object.keys(t).sort(), ['discount', 'lines', 'subtotal', 'tax', 'total']);
  assert.deepEqual(Object.keys(t.lines[0]).sort(), ['discount', 'gross', 'net', 'qty', 'sku', 'tax', 'unitPrice']);
});
test('hồi quy: formatMoney / fromCents', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(100000005), '1,000,000.05');
  assert.equal(formatMoney(-5), '-0.05');
  assert.equal(formatMoney(0), '0.00');
  assert.equal(fromCents(1234), 12.34);
});
test('hồi quy: mã không phân biệt hoa thường, removeCoupon', () => {
  const { cart } = shop([{ code: 'Sale', type: 'percent', percent: 50 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('sALE', NOW);
  assert.equal(computeTotals(cart).discount, 500);
  cart.removeCoupon();
  assert.equal(computeTotals(cart).discount, 0);
});
test('hồi quy: addItem cộng dồn số lượng', () => {
  const { cart, inv } = shop([], { A: 10 });
  cart.addItem('A', 2);
  cart.addItem('A', 3);
  assert.equal(cart.items()[0].qty, 5);
  assert.equal(inv.available('A'), 5);
});
test('hồi quy: tham số sai', () => {
  const { cart } = shop();
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 1.5), RangeError);
  assert.throws(() => cart.updateQty('A', 1), /không có/);
  assert.throws(() => cart.addItem('NOPE', 1), /Không có sản phẩm/);
});
