'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals, toCents, allocate, freeUnits } = require('../src');

function setup(promos = [], stock = { A: 10, B: 10, C: 10 }, price = 1) {
  const catalog = new Catalog(['A', 'B', 'C'].map((sku) => ({ sku, name: sku, price, category: 'x' })));
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('toCents làm tròn half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(12.34), 1234);
});

test('allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
});

test('giảm cố định 10.00 trên giỏ 3 món: tổng giảm đúng 1000', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 10 }], undefined, 10);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('giảm % tổng giảm khớp số tiền mã', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 10 }], undefined, 3.33);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('P');
  assert.equal(computeTotals(cart).discount, Math.round((999 * 10) / 100));
});

test('freeUnits mua 2 tặng 1', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
});

test('endsAt dùng được hết ngày UTC', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  cart.applyCoupon('E', new Date('2026-11-30T10:00:00Z'));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('kho: sửa số lượng và xóa món', () => {
  const { cart, inv } = setup([], { A: 4, B: 1, C: 1 });
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.available('A'), 1);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net', () => {
  const { cart } = setup([{ code: 'P', type: 'percent', percent: 50 }], undefined, 10);
  cart.addItem('A', 2);
  cart.applyCoupon('P');
  const t = computeTotals(cart);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1000 + 100);
});

test('toCents: 0, số lớn, giá sản phẩm và minSubtotal dùng cùng cách làm tròn', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(-0), 0);
  assert.equal(toCents(123456789.01), 12345678901);
  assert.equal(toCents(0.29), 29);
  const { cart } = setup([{ code: 'M', type: 'percent', percent: 10, minSubtotal: 1.005 }], undefined, 1.005);
  cart.addItem('A'); // giá 1.005 -> 101 xu, minSubtotal 1.005 -> 101 xu
  assert.doesNotThrow(() => cart.applyCoupon('M'));
  assert.equal(cart.subtotalCents(), 101);
});

test('allocate: tổng đúng, hòa thì dòng trước, weights chứa 0', () => {
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(100, [0, 1, 1]), [0, 50, 50]);
  assert.deepEqual(allocate(1, [0, 1, 1]), [0, 1, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
  const r = allocate(999, [333, 333, 333, 1]);
  assert.equal(r.reduce((a, b) => a + b, 0), 999);
});

test('endsAt: 23:59:59Z còn dùng được, 00:00:00Z ngày sau bị từ chối', () => {
  const { cart } = setup([{ code: 'E', type: 'percent', percent: 10, endsAt: '2026-11-30' }]);
  cart.addItem('A');
  assert.doesNotThrow(() => cart.applyCoupon('E', new Date('2026-11-30T23:59:59Z')));
  assert.throws(() => cart.applyCoupon('E', new Date('2026-12-01T00:00:00Z')), /hết hạn/);
});

test('freeUnits mua 1 tặng 1', () => {
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(3, 1, 1), 1);
  assert.equal(freeUnits(4, 1, 1), 2);
});

test('giảm cố định lớn hơn tạm tính không làm giỏ âm; tổng giảm các dòng khớp', () => {
  const { cart } = setup([{ code: 'F', type: 'fixed', amount: 100 }], undefined, 3.33);
  ['A', 'B', 'C'].forEach((s) => cart.addItem(s, 1));
  cart.applyCoupon('F');
  const t = computeTotals(cart);
  assert.equal(t.discount, 999);
  assert.ok(t.lines.every((l) => l.net === 0));
});

test('giữ chỗ luôn bằng số lượng trong giỏ qua add/update/remove', () => {
  const { cart, inv } = setup([], { A: 10, B: 10, C: 10 });
  const held = () => 10 - inv.available('A');
  cart.addItem('A', 2); assert.equal(held(), 2);
  cart.addItem('A', 1); assert.equal(held(), 3);
  cart.updateQty('A', 6); assert.equal(held(), 6);
  cart.updateQty('A', 2); assert.equal(held(), 2);
  cart.updateQty('A', 0); assert.equal(held(), 0);
  cart.addItem('A', 4); cart.removeItem('A'); assert.equal(held(), 0);
});
