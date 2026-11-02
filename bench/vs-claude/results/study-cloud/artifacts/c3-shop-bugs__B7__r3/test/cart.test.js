import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('total without coupon', () => {
  setStock('A', 100);
  const c = createCart();
  addItem(c, 'A', 25000, 2);
  assert.equal(total(c), 50000);
});
test('10% coupon on 100000', () => {
  setStock('B', 100);
  const c = createCart();
  addItem(c, 'B', 100000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 90000);
});
test('coupon applies once across multiple lines, integer result', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 10001, 1);
  addItem(c, 'C2', 10001, 1);
  applyCoupon(c, 15);
  assert.equal(total(c), 17002); // 20002 - round(3000.3)
});
test('applyPercent rounds half-up to integer dong', () => {
  assert.equal(applyPercent(5, 10), 4); // discount 0.5 -> 1
  assert.equal(applyPercent(1005, 15), 854); // discount 150.75 -> 151
  assert.equal(applyPercent(1000, 0), 1000);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 1000, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'D', 1000, 1), /QTY_LIMIT/);
});
test('stock never goes negative', () => {
  setStock('E', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'E', 1000, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 3);
  addItem(c, 'E', 1000, 3);
  assert.equal(available('E'), 0);
  assert.throws(() => addItem(c, 'E', 1000, 1), /INSUFFICIENT_STOCK/);
  removeItem(c, 'E');
  assert.equal(available('E'), 3);
});
