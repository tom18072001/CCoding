'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, OutOfStockError } = require('../src');
const { toCents, allocate, formatMoney } = require('../src/money');
const { freeUnits, checkValidity } = require('../src/promotions');
const { lineTax } = require('../src/tax');

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 10, category: 'x' },
    { sku: 'B', name: 'B', price: 5.5, category: 'y', taxClass: 'reduced' },
    { sku: 'Z', name: 'Z', price: 2, category: 'x', taxClass: 'zero' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 4, Z: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}

// ---- Phần 1: hành vi vốn đúng ----
test('giỏ rỗng: mọi tổng bằng 0', () => {
  const { cart } = setup();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test('không khuyến mãi: subtotal, thuế theo loại, total', () => {
  const { cart } = setup();
  cart.addItem('A', 2); cart.addItem('B'); cart.addItem('Z');
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 2000 + 550 + 200);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 200 + 28 + 0); // 27.5 -> 28 half up
  assert.equal(t.total, 2750 + 228);
  assert.deepEqual(t.lines[0], { sku: 'A', qty: 2, unitPrice: 1000, gross: 2000, discount: 0, net: 2000, tax: 200 });
});

test('mã % toàn giỏ: tổng giảm đúng, net = gross - discount', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }]);
  cart.addItem('A'); cart.addItem('B');
  cart.applyCoupon('p');
  const t = computeTotals(cart);
  assert.equal(t.discount, Math.round(1550 * 0.1));
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
  assert.equal(t.total, t.subtotal - t.discount + t.tax);
});

test('mã theo danh mục chỉ giảm dòng thuộc danh mục', () => {
  const { cart } = setup([{ code: 'C', type: 'category', category: 'x', percent: 20 }]);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('Z');
  cart.applyCoupon('C');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 0, 40]);
});

test('mã cố định không làm giỏ âm', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 100 }]);
  cart.addItem('A');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.total, 0);
});

test('thuế với số tiền tròn', () => {
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(1000, 'reduced'), 50);
  assert.equal(lineTax(1000, 'zero'), 0);
  assert.equal(lineTax(0, 'standard'), 0);
  assert.throws(() => lineTax(100, 'bogus'));
});

test('allocate: tổng đúng bằng total, giữ thứ tự', () => {
  for (const [total, w] of [[100, [1, 1, 1]], [7, [3, 2, 2]], [999, [1, 2, 3, 4]], [5, [0, 1, 0]]]) {
    const r = allocate(total, w);
    assert.equal(r.reduce((a, b) => a + b, 0), total);
    assert.equal(r.length, w.length);
  }
  assert.deepEqual(allocate(5, [0, 1, 0]), [0, 5, 0]);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(100, [1]), [100]);
  assert.deepEqual(allocate(100, []), []);
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(-5), '-0.05');
});

// ---- Phần 2: biên của 6 lỗi ----
test('#1 làm tròn nửa xu dương/âm', () => {
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(-0.005), -1);
  assert.equal(toCents(1.004), 100);
  assert.equal(toCents(-1.004), -100);
  assert.equal(toCents(1.015), 102);
  assert.equal(toCents(8.345), 835);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(19.99), 1999);
  assert.throws(() => toCents(NaN), TypeError);
});

test('#1 giá sản phẩm 1.005 -> 101 xu và minSubtotal dùng toCents', () => {
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], [
    { sku: 'P', name: 'P', price: 1.005, category: 'x' },
  ], { P: 5 });
  assert.equal(cart.catalog.get('P').priceCents, 101);
  cart.addItem('P');
  assert.doesNotThrow(() => cart.applyCoupon('M')); // 101 >= toCents(1.005) = 101
});

test('#2 giảm chia đúng tổng, phần dư cho phần lẻ lớn nhất', () => {
  assert.deepEqual(allocate(1000, [333, 333, 334]), [333, 333, 334]);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }], [
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x' },
    { sku: 'C', name: 'C', price: 3.34, category: 'x' },
  ], { A: 1, B: 1, C: 1 });
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('#3 mua X tặng Y: 0, 1 và bội của (buy+free)', () => {
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(1, 2, 1), 0);
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(9, 2, 1), 3);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(10, 3, 2), 4);
  assert.equal(freeUnits(9, 3, 2), 2);
});

test('#3 bxgy qua computeTotals', () => {
  const mk = (q) => {
    const { cart } = setup([{ code: 'B', type: 'bxgy', sku: 'A', buy: 2, free: 1 }], undefined, { A: 10, B: 4, Z: 4 });
    if (q) cart.addItem('A', q);
    cart.applyCoupon('B');
    return computeTotals(cart);
  };
  assert.equal(mk(0).discount, 0);
  assert.equal(mk(1).discount, 0);
  assert.equal(mk(2).discount, 0);
  assert.equal(mk(3).discount, 1000);
  assert.equal(mk(6).discount, 2000);
});

test('#4 endsAt: đúng ngày, ngày kế tiếp, trước đó', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-29T12:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
  assert.throws(() => checkValidity(p, new Date('2027-01-01T00:00:00Z'), 0), /hết hạn/);
});

test('startsAt: hiệu lực từ đầu ngày UTC', () => {
  const p = { code: 'S', startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59.999Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-20T00:00:00Z'), 0));
});

test('minSubtotal: đủ và thiếu', () => {
  const p = { code: 'M', minSubtotal: 10 };
  assert.doesNotThrow(() => checkValidity(p, new Date(), 1000));
  assert.throws(() => checkValidity(p, new Date(), 999), /tối thiểu/);
});

test('#5 giữ chỗ khi tăng, giảm, xóa; quá tồn kho thì lỗi và không đổi trạng thái', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  assert.equal(inv.available('A'), 2);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(inv.available('A'), 3);
  assert.equal(cart.lines.get('A'), 1);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('#5 hai giỏ dùng chung kho: xóa ở giỏ này nhả cho giỏ kia', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory({ A: 4 });
  const c1 = new Cart(catalog, inv);
  const c2 = new Cart(catalog, inv);
  c1.addItem('A', 3);
  assert.throws(() => c2.addItem('A', 2), OutOfStockError);
  c1.removeItem('A');
  assert.doesNotThrow(() => c2.addItem('A', 4));
  assert.equal(inv.available('A'), 0);
});

test('#6 thuế tính trên net sau giảm, từng dòng', () => {
  const { cart } = setup([{ code: 'C', type: 'category', category: 'x', percent: 50 }]);
  cart.addItem('A'); cart.addItem('B');
  cart.applyCoupon('C');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 500);
  assert.equal(t.lines[0].tax, 50);
  assert.equal(t.lines[1].net, 550);
  assert.equal(t.lines[1].tax, 28);
  assert.equal(t.tax, 78);
  assert.equal(t.total, 500 + 550 + 78);
});

test('#6 giảm 100% thì thuế bằng 0', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 100 }]);
  cart.addItem('A');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 0);
  assert.equal(t.total, 0);
});
