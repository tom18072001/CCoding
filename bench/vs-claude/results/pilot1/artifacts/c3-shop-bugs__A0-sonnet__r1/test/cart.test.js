import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';

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

test('coupon applies once to subtotal, not per line', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 15, 1);
  addItem(c, 'C2', 15, 1);
  applyCoupon(c, 15); // 30 * 0.85 = 25.5 -> discount 4.5 -> 5 -> 25
  assert.equal(total(c), 25);
});
test('coupon result is always an integer, rounding half-up', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 999, 1);
  applyCoupon(c, 15); // discount 149.85 -> 150
  assert.equal(total(c), 849);
  applyCoupon(c, 50); // discount 499.5 -> 500
  assert.equal(total(c), 499);
});
test('stock cannot go negative', () => {
  setStock('E', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'E', 1000, 4), /INSUFFICIENT_STOCK/);
  addItem(c, 'E', 1000, 3);
  assert.equal(available('E'), 0);
  assert.throws(() => addItem(c, 'E', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 0);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('F', 100);
  const c = createCart();
  addItem(c, 'F', 10, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'F', 10, 1), /QTY_LIMIT/);
  assert.equal(available('F'), 100 - MAX_QTY_PER_LINE);
});
