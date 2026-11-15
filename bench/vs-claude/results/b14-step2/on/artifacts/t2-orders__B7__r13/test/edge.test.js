'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, PromotionError, OutOfStockError } = require('../src');
const { toCents, allocate } = require('../src/money');
const { freeUnits } = require('../src/promotions');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 1, taxClass) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x', taxClass })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv, catalog };
}

// ---- Lỗi 1: toCents
test('toCents: 0, âm, nửa xu', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(0.5), 50);
  assert.equal(toCents(-0.01), -1);
  assert.equal(toCents(19.99), 1999);
});

test('giá sản phẩm 1.005 và giá trị đơn tối thiểu dùng toCents', () => {
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], undefined, 1.005);
  cart.addItem('A');
  assert.equal(cart.subtotalCents(), 101);
  assert.doesNotThrow(() => cart.applyCoupon('M'));
});

test('mã giảm cố định 2.675 giảm 268 xu', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 2.675 }], undefined, 10);
  cart.addItem('A');
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 268);
});

// ---- Lỗi 2: allocate
test('allocate: hòa phần dư, không chia hết, một phần tử, tổng 0', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(1, [1, 1]), [1, 0]);
  assert.deepEqual(allocate(7, [5]), [7]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
  const r = allocate(1001, [3, 7, 11, 13]);
  assert.equal(r.reduce((a, b) => a + b, 0), 1001);
});

test('allocate: phần dư lớn nhất được ưu tiên', () => {
  assert.deepEqual(allocate(10, [1, 1, 2]), [3, 2, 5]);
  assert.deepEqual(allocate(5, [1, 2, 2]), [1, 2, 2]);
  assert.deepEqual(allocate(100, [1, 2]), [33, 67]);
});

test('tổng giảm cố định 10.00 trên 3 món 33.33 = 1000; % khớp tổng dòng', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }, { code: 'P', type: 'percent', percent: 10 }], undefined, 33.33);
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('F');
  let t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
  cart.applyCoupon('P');
  t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), t.discount);
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
});

test('mã cố định lớn hơn giỏ không làm giỏ âm', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 100 }], undefined, 5);
  cart.addItem('A');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 500);
  assert.equal(t.total, 0);
});

// ---- Lỗi 3: bxgy
test('freeUnits: qty = buy, buy+free, 2*(buy+free)-1, 2*(buy+free)', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(3, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
});

test('bxgy trong computeTotals: 2 hộp không giảm, 3 hộp giảm 1', () => {
  const promo = { code: 'B', type: 'bxgy', sku: 'A', buy: 2, free: 1 };
  const a = setup([promo], undefined, 10);
  a.cart.addItem('A', 2); a.cart.applyCoupon('B');
  assert.equal(computeTotals(a.cart).discount, 0);
  const b = setup([promo], undefined, 10);
  b.cart.addItem('A', 3); b.cart.applyCoupon('B');
  assert.equal(computeTotals(b.cart).discount, 1000);
  const c = setup([promo], undefined, 10);
  c.cart.addItem('A', 5); c.cart.addItem('B', 3); c.cart.applyCoupon('B');
  assert.equal(computeTotals(c.cart).discount, 1000);
});

// ---- Lỗi 4: endsAt
test('endsAt: hết ngày UTC còn dùng được, từ 00:00 ngày sau bị từ chối', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T00:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), PromotionError);
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-02T00:00:00Z')), PromotionError);
});

test('startsAt: từ đầu ngày; chưa tới thì bị từ chối', () => {
  const { cart } = setup([{ code: 'S', type: 'percent', percent: 10, startsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.throws(() => cart.applyCoupon('S', new Date('2026-11-29T23:59:59Z')), PromotionError);
  assert.doesNotThrow(() => cart.applyCoupon('S', new Date('2026-11-30T00:00:00Z')));
});

// ---- Lỗi 5: kho
test('kho: add, updateQty tăng/giảm, removeItem', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  assert.equal(inv.available('A'), 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(inv.available('A'), 0);
  assert.equal(cart.lines.get('A'), 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  assert.equal(inv.reserved.get('A'), 0);
});

test('kho: updateQty 0 trả hết chỗ; hai giỏ dùng chung kho', () => {
  const { cart: c1, inv, catalog } = setup([], { A: 4 });
  const c2 = new Cart(catalog, inv, []);
  c1.addItem('A', 3);
  assert.throws(() => c2.addItem('A', 2), OutOfStockError);
  c1.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  c2.addItem('A', 4);
  assert.equal(inv.available('A'), 0);
  assert.throws(() => c1.addItem('A', 1), OutOfStockError);
});

// ---- Lỗi 6: thuế
test('thuế tính trên net sau giảm giá', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 2 }], undefined, 10);
  cart.addItem('A');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 800);
  assert.equal(t.lines[0].tax, 80);
  assert.equal(t.tax, 80);
  assert.equal(t.total, 880);
});

test('thuế reduced/zero trên net; nửa xu làm tròn lên', () => {
  const r = setup([{ code: 'P', type: 'percent', percent: 50 }], undefined, 10, 'reduced');
  r.cart.addItem('A'); r.cart.applyCoupon('P');
  assert.equal(computeTotals(r.cart).tax, 25);
  const z = setup([], undefined, 10, 'zero');
  z.cart.addItem('A');
  assert.equal(computeTotals(z.cart).tax, 0);
  const h = setup([], undefined, 0.05, 'standard');
  h.cart.addItem('A');
  assert.equal(computeTotals(h.cart).tax, 1);
});

// ---- Hành vi đang đúng
test('giỏ rỗng và không khuyến mãi', () => {
  const { cart } = setup();
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
  cart.addItem('A', 2);
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 200);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 20);
  assert.equal(t.total, 220);
});

test('mã không tồn tại, qty không hợp lệ, removeItem món không có', () => {
  const { cart } = setup();
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 1.5), RangeError);
  assert.doesNotThrow(() => cart.removeItem('A'));
});
