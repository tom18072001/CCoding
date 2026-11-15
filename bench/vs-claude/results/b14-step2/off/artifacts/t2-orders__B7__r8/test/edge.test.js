'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, OutOfStockError, PromotionError } = require('../src');
const { toCents, allocate, formatMoney } = require('../src/money');
const { freeUnits } = require('../src/promotions');
const { lineTax } = require('../src/tax');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, products) {
  const prods = products ?? ['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price: 10, category: 'x' }));
  const inv = new Inventory(stock);
  return { cart: new Cart(new Catalog(prods), inv, promos), inv };
}

// ---- #1 làm tròn tiền
test('edge #1 toCents các ca biên', () => {
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(-0.005), -1);
  assert.equal(toCents(1.004), 100);
  assert.equal(toCents(1.015), 102);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(1234567.891), 123456789);
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents('1'), TypeError);
});

test('edge #1 giá sản phẩm và minSubtotal dùng toCents', () => {
  const { cart } = setup(
    [{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }],
    { A: 5 },
    [{ sku: 'A', name: 'A', price: 1.005, category: 'x' }],
  );
  cart.addItem('A');
  assert.equal(cart.subtotalCents(), 101);
  assert.doesNotThrow(() => cart.applyCoupon('M'));
});

// ---- #2 allocate
test('edge #2 allocate ca biên', () => {
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(5, []), []);
  assert.deepEqual(allocate(1, [1, 1, 1]), [1, 0, 0]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(5, [0, 1]), [0, 5]);
  assert.deepEqual(allocate(100, [50]), [100]);
});

test('edge #2 allocate: tổng luôn đúng', () => {
  assert.deepEqual(allocate(10, [1, 1, 8]), [1, 1, 8]);
  for (const total of [1, 7, 99, 1000, 12345]) {
    const out = allocate(total, [3, 7, 11, 13]);
    assert.equal(out.reduce((a, b) => a + b, 0), total);
  }
});

test('edge #2 mã fixed không làm giỏ âm', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 100 }]);
  cart.addItem('A'); cart.addItem('B');
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 2000);
  assert.ok(t.lines.every((l) => l.net === 0));
  assert.equal(t.total, 0);
});

// ---- #3 bxgy
test('edge #3 freeUnits các cấu hình', () => {
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(4, 3, 1), 1);
  assert.equal(freeUnits(9, 2, 1), 3);
  assert.equal(freeUnits(10, 3, 2), 4);
  assert.equal(freeUnits(4, 3, 2), 0);
});

test('edge #3 bxgy trong checkout chỉ giảm đúng sku', () => {
  const { cart } = setup([{ code: 'B', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 2); cart.addItem('B', 3);
  cart.applyCoupon('B');
  assert.equal(computeTotals(cart).discount, 0);
  cart.updateQty('A', 6);
  const t = computeTotals(cart);
  assert.equal(t.discount, 2000);
  assert.equal(t.lines.find((l) => l.sku === 'B').discount, 0);
});

// ---- #4 hết hạn
test('edge #4 startsAt/endsAt theo UTC', () => {
  const { cart } = setup([{ code: 'W', type: 'percent', percent: 5, startsAt: '2026-11-10', endsAt: '2026-11-10' }]);
  cart.addItem('A');
  assert.throws(() => cart.applyCoupon('W', new Date('2026-11-09T23:59:59.999Z')), PromotionError);
  assert.doesNotThrow(() => cart.applyCoupon('W', new Date('2026-11-10T00:00:00Z')));
  assert.doesNotThrow(() => cart.applyCoupon('W', new Date('2026-11-10T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('W', new Date('2026-11-11T00:00:00Z')), /hết hạn/);
});

test('edge #4 mã không tồn tại, không phân biệt hoa thường', () => {
  const { cart } = setup([{ code: 'Abc', type: 'percent', percent: 5 }]);
  cart.addItem('A');
  assert.throws(() => cart.applyCoupon('nope'), /không tồn tại/);
  assert.equal(cart.applyCoupon('aBC').code, 'Abc');
});

// ---- #5 tồn kho
test('edge #5 giữ chỗ luôn bằng tổng số lượng trong giỏ', () => {
  const { cart, inv } = setup([], { A: 5, B: 5 });
  cart.addItem('A', 2); cart.addItem('A', 1); cart.addItem('B', 4);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 2);
  cart.updateQty('A', 5);
  assert.equal(inv.available('A'), 0);
  cart.removeItem('B');
  assert.equal(inv.available('B'), 5);
  cart.removeItem('B');
  assert.equal(inv.available('B'), 5);
});

test('edge #5 vượt tồn kho khi sửa không làm đổi trạng thái', () => {
  const { cart, inv } = setup([], { A: 4 });
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(inv.available('A'), 2);
  assert.equal(cart.lines.get('A'), 2);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('edge #5 hai giỏ chia sẻ kho; xóa ở giỏ này mở hàng cho giỏ kia', () => {
  const catalog = new Catalog([{ sku: 'A', name: 'A', price: 1, category: 'x' }]);
  const inv = new Inventory({ A: 4 });
  const c1 = new Cart(catalog, inv);
  const c2 = new Cart(catalog, inv);
  c1.addItem('A', 3);
  assert.throws(() => c2.addItem('A', 2), OutOfStockError);
  c1.removeItem('A');
  assert.doesNotThrow(() => c2.addItem('A', 4));
});

test('edge #5 đầu vào không hợp lệ', () => {
  const { cart } = setup([], { A: 4 });
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 1.5), RangeError);
  assert.throws(() => cart.updateQty('A', 1), /không có/);
  cart.addItem('A', 1);
  assert.throws(() => cart.updateQty('A', -1), RangeError);
});

// ---- #6 thuế
test('edge #6 thuế theo net từng dòng, nhiều loại thuế', () => {
  const { cart } = setup(
    [{ code: 'P', type: 'percent', percent: 20 }],
    undefined,
    [
      { sku: 'A', name: 'A', price: 10, category: 'x' },
      { sku: 'B', name: 'B', price: 10, category: 'x', taxClass: 'reduced' },
      { sku: 'C', name: 'C', price: 10, category: 'x', taxClass: 'zero' },
    ],
  );
  cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  const nets = t.lines.map((l) => l.net);
  assert.equal(nets.reduce((a, b) => a + b, 0), 2400);
  assert.deepEqual(t.lines.map((l) => l.tax), [lineTax(nets[0], 'standard'), lineTax(nets[1], 'reduced'), 0]);
  assert.equal(t.tax, t.lines.reduce((a, l) => a + l.tax, 0));
  assert.equal(t.total, 2400 + t.tax);
});

test('edge #6 lineTax làm tròn và loại thuế sai', () => {
  assert.equal(lineTax(5, 'standard'), 1);
  assert.equal(lineTax(4, 'standard'), 0);
  assert.equal(lineTax(1000, 'zero'), 0);
  assert.throws(() => lineTax(1, 'bogus'));
});

// ---- hành vi đang đúng
test('giữ nguyên: giỏ trống', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }, { code: 'F', type: 'fixed', amount: 5 }]);
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).total, 0);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 0);
});

test('giữ nguyên: tổng tiền thường không mã', () => {
  const { cart } = setup();
  cart.addItem('A', 2); cart.addItem('B');
  const t = computeTotals(cart);
  assert.equal(t.subtotal, 3000);
  assert.equal(t.discount, 0);
  assert.equal(t.tax, 300);
  assert.equal(t.total, 3300);
  assert.deepEqual(t.lines[0], { sku: 'A', qty: 2, unitPrice: 1000, gross: 2000, discount: 0, net: 2000, tax: 200 });
});

test('giữ nguyên: mã percent', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }]);
  cart.addItem('A', 2); cart.addItem('B');
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.discount, 300);
  assert.equal(t.tax, 270);
  assert.equal(t.total, 2700 + 270);
  cart.removeCoupon();
  assert.equal(computeTotals(cart).discount, 0);
});

test('giữ nguyên: mã category chỉ giảm dòng đúng danh mục', () => {
  const { cart } = setup(
    [{ code: 'C', type: 'category', category: 'food', percent: 50 }],
    undefined,
    [
      { sku: 'A', name: 'A', price: 10, category: 'food' },
      { sku: 'B', name: 'B', price: 10, category: 'toy' },
    ],
  );
  cart.addItem('A', 2); cart.addItem('B');
  cart.applyCoupon('C');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [1000, 0]);
  assert.equal(t.total, 2000 + 200);
});

test('giữ nguyên: minSubtotal', () => {
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 25 }]);
  cart.addItem('A', 2);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
  cart.addItem('B');
  assert.doesNotThrow(() => cart.applyCoupon('M'));
  const { cart: c2 } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 20 }]);
  c2.addItem('A', 2);
  assert.doesNotThrow(() => c2.applyCoupon('M'));
});

test('giữ nguyên: formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
  assert.equal(formatMoney(0), '0.00');
});
