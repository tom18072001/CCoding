'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../src');
const { Catalog, Inventory, Cart, computeTotals, PromotionError, OutOfStockError, checkValidity, freeUnits, lineTax, toCents, fromCents, formatMoney, allocate } = api;

function setup(promos = [], products, stock) {
  const catalog = new Catalog(products ?? [
    { sku: 'A', name: 'A', price: 10, category: 'x' },
    { sku: 'B', name: 'B', price: 20, category: 'y', taxClass: 'reduced' },
    { sku: 'C', name: 'C', price: 5, category: 'x', taxClass: 'zero' },
  ]);
  const inv = new Inventory(stock ?? { A: 4, B: 4, C: 4 });
  return { cart: new Cart(catalog, inv, promos), inv };
}
const sumOf = (a) => a.reduce((x, y) => x + y, 0);

// ---------- Nhóm 1: hành vi vốn đúng ----------
test('API công khai giữ nguyên tên', () => {
  for (const n of ['Catalog', 'Inventory', 'Cart', 'computeTotals', 'PromotionError', 'OutOfStockError', 'checkValidity', 'freeUnits', 'lineTax', 'toCents', 'fromCents', 'formatMoney', 'allocate']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('giá hợp lệ thông thường và format', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.1), 10);
  assert.equal(toCents(19.99), 1999);
  assert.equal(fromCents(1234), 12.34);
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
});

test('giỏ rỗng', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }]);
  cart.applyCoupon('P');
  assert.deepEqual(computeTotals(cart), { lines: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test('dạng kết quả computeTotals', () => {
  const { cart } = setup();
  cart.addItem('A', 2);
  const t = computeTotals(cart);
  assert.deepEqual(Object.keys(t).sort(), ['discount', 'lines', 'subtotal', 'tax', 'total']);
  assert.deepEqual(Object.keys(t.lines[0]).sort(), ['discount', 'gross', 'net', 'qty', 'sku', 'tax', 'unitPrice']);
  assert.equal(t.total, 2000 + 200);
});

test('thuế 0%/5%/10% trên số tiền tròn', () => {
  assert.equal(lineTax(10000, 'standard'), 1000);
  assert.equal(lineTax(10000, 'reduced'), 500);
  assert.equal(lineTax(10000, 'zero'), 0);
  assert.throws(() => lineTax(100, 'bogus'));
});

test('giảm % và giảm cố định chia đều', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }, { code: 'F', type: 'fixed', amount: 6 }]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.applyCoupon('P');
  let t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [100, 200]);
  assert.equal(t.discount, 300);
  cart.applyCoupon('F');
  t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [200, 400]);
});

test('giảm cố định không làm giỏ âm', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 1000 }]);
  cart.addItem('A', 1);
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.total, 0);
});

test('khuyến mãi trước hạn và sau hạn', () => {
  const p = { code: 'D', type: 'percent', percent: 10, startsAt: '2026-11-10', endsAt: '2026-11-30' };
  const { cart } = setup([p]);
  assert.throws(() => cart.applyCoupon('D', new Date('2026-11-09T23:59:59Z')), PromotionError);
  assert.ok(cart.applyCoupon('d', new Date('2026-11-10T00:00:00Z')));
  assert.throws(() => cart.applyCoupon('D', new Date('2026-12-02T00:00:00Z')), PromotionError);
  assert.throws(() => cart.applyCoupon('NOPE'), PromotionError);
});

test('minSubtotal', () => {
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 25 }]);
  cart.addItem('A', 2);
  assert.throws(() => cart.applyCoupon('M'), /tối thiểu/);
  cart.addItem('A', 1);
  assert.ok(cart.applyCoupon('M'));
});

test('category và bxgy', () => {
  const { cart } = setup([
    { code: 'CAT', type: 'category', category: 'y', percent: 50 },
    { code: 'BG', type: 'bxgy', sku: 'A', buy: 2, free: 1 },
  ]);
  cart.addItem('A', 3);
  cart.addItem('B', 1);
  cart.applyCoupon('CAT');
  let t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [0, 1000]);
  cart.applyCoupon('BG');
  t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.discount), [1000, 0]);
});

test('updateQty tăng/giảm/về 0', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 1);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 2);
  assert.equal(inv.available('A'), 2);
  cart.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  assert.equal(cart.items().length, 0);
  assert.throws(() => cart.updateQty('A', 1));
  assert.throws(() => cart.addItem('A', 0), RangeError);
  assert.throws(() => cart.addItem('A', 5), OutOfStockError);
});

// ---------- Nhóm 2: ca biên cho 6 lỗi ----------
test('#1 toCents ca biên', () => {
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(-0.005), -1);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(0.004), 0);
  assert.equal(Object.is(toCents(-0.001), 0), true);
  assert.equal(toCents(1.015), 102);
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents('1'), TypeError);
});

test('#1 catalog, fixed, minSubtotal dùng cùng cách làm tròn', () => {
  const { cart } = setup([
    { code: 'F', type: 'fixed', amount: 2.675 },
    { code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 },
  ], [{ sku: 'P', name: 'P', price: 1.005, category: 'x' }], { P: 10 });
  cart.addItem('P', 3);
  assert.equal(cart.items()[0].product.priceCents, 101);
  cart.applyCoupon('F');
  assert.equal(computeTotals(cart).discount, 268);
  assert.ok(cart.applyCoupon('M'));
  const c2 = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], [{ sku: 'P', name: 'P', price: 1.0, category: 'x' }], { P: 5 }).cart;
  c2.addItem('P', 1); // 100 < 101
  assert.throws(() => c2.applyCoupon('M'), PromotionError);
});

test('#2 allocate: không chia hết, phần dư bằng nhau, tổng bảo toàn', () => {
  assert.deepEqual(allocate(1000, [100, 100, 100]), [334, 333, 333]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(0, [3, 4]), [0, 0]);
  // phần lẻ lớn nhất được ưu tiên, không phải phần đứng trước
  assert.deepEqual(allocate(1, [1, 3, 3]), [0, 1, 0]);
  assert.deepEqual(allocate(3, [1, 6, 3]), [0, 2, 1]);
  const cases = [[999, [7, 13, 29, 1]], [1, [5, 5, 5]], [12345, [3, 3, 3, 3, 3, 1]], [100, [1, 0, 1]], [10, [1, 1, 8]]];
  for (const [tot, w] of cases) assert.equal(sumOf(allocate(tot, w)), tot);
});

test('#2 tổng giảm của dòng bằng số tiền của mã', () => {
  const mk = (promo) => {
    const { cart } = setup([promo], [
      { sku: 'A', name: 'A', price: 1, category: 'x' },
      { sku: 'B', name: 'B', price: 1, category: 'x' },
      { sku: 'C', name: 'C', price: 1, category: 'x' },
    ], { A: 9, B: 9, C: 9 });
    cart.addItem('A'); cart.addItem('B'); cart.addItem('C');
    cart.applyCoupon(promo.code);
    return computeTotals(cart);
  };
  let t = mk({ code: 'F', type: 'fixed', amount: 1 });
  assert.equal(t.discount, 100);
  assert.deepEqual(t.lines.map((l) => l.discount), [34, 33, 33]);
  t = mk({ code: 'P', type: 'percent', percent: 33.33 });
  assert.equal(t.discount, Math.round((300 * 33.33) / 100));
  assert.equal(sumOf(t.lines.map((l) => l.discount)), t.discount);
  assert.equal(t.total, sumOf(t.lines.map((l) => l.net + l.tax)));
});

test('#3 freeUnits buy/free với qty nhỏ', () => {
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(1, 2, 1), 0);
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('#3 bxgy trong giỏ: 2 hộp không được tặng', () => {
  const { cart } = setup([{ code: 'BG', type: 'bxgy', sku: 'A', buy: 2, free: 1 }]);
  cart.addItem('A', 2);
  cart.applyCoupon('BG');
  assert.equal(computeTotals(cart).discount, 0);
  cart.updateQty('A', 3);
  assert.equal(computeTotals(cart).discount, 1000);
});

test('#4 endsAt đúng ngày kết thúc và ngày kế tiếp', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T00:00:00Z')));
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z')));
  assert.ok(cart.applyCoupon('E', new Date('2026-11-30T23:59:59.999Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:01Z')), PromotionError);
  assert.doesNotThrow(() => checkValidity({ code: 'Y', endsAt: '2026-12-31' }, new Date('2026-12-31T12:00:00Z'), 0));
  assert.throws(() => checkValidity({ code: 'Y', endsAt: '2026-12-31' }, new Date('2027-01-01T00:00:00Z'), 0), PromotionError);
});

test('#6 thuế tính trên net sau giảm giá', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }]);
  cart.addItem('A', 1); // 1000, standard 10%
  cart.addItem('B', 1); // 2000, reduced 5%
  cart.addItem('C', 1); // 500, zero
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.net), [500, 1000, 250]);
  assert.deepEqual(t.lines.map((l) => l.tax), [50, 50, 0]);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 500 + 1000 + 250 + 100);
});

test('#6 thuế làm tròn half up từng dòng', () => {
  assert.equal(lineTax(5, 'standard'), 1); // 0.5 -> 1
  assert.equal(lineTax(4, 'standard'), 0);
  assert.equal(lineTax(10, 'reduced'), 1); // 0.5 -> 1
  assert.equal(lineTax(1005, 'standard'), 101); // 100.5 -> 101
  assert.equal(lineTax(0, 'standard'), 0);
});

test('#5 kho: thêm 2 rồi sửa thành 3 khi còn 4', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  assert.doesNotThrow(() => cart.updateQty('A', 3));
  assert.equal(inv.available('A'), 1);
  assert.doesNotThrow(() => cart.updateQty('A', 4));
  assert.equal(inv.available('A'), 0);
  assert.throws(() => cart.updateQty('A', 5), OutOfStockError);
  assert.equal(inv.available('A'), 0);
  assert.equal(cart.lines.get('A'), 4);
});

test('#5 removeItem trả tồn kho cho khách khác', () => {
  const { cart, inv } = setup();
  const other = new Cart(cart.catalog, inv, []);
  cart.addItem('A', 4);
  assert.throws(() => other.addItem('A', 1), OutOfStockError);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  assert.doesNotThrow(() => other.addItem('A', 4));
  cart.removeItem('A'); // món không có trong giỏ: không lỗi, không đổi kho
  assert.equal(inv.available('A'), 0);
});

test('#5 reserved luôn bằng tổng qty trong các giỏ', () => {
  const { cart, inv } = setup();
  const other = new Cart(cart.catalog, inv, []);
  cart.addItem('A', 1); other.addItem('A', 2);
  cart.updateQty('A', 2); other.updateQty('A', 1);
  assert.equal(inv.reserved.get('A'), 3);
  cart.addItem('A', 1);
  assert.equal(inv.reserved.get('A'), 4);
  cart.updateQty('A', 0);
  other.removeItem('A');
  assert.equal(inv.reserved.get('A') ?? 0, 0);
  assert.equal(inv.available('A'), 4);
});
