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

test('coupon applies once to subtotal, rounded half-up to integer', () => {
  setStock('C', 100); setStock('D', 100);
  const c = createCart();
  addItem(c, 'C', 333, 1);
  addItem(c, 'D', 333, 2);
  applyCoupon(c, 15); // 999 * 15% = 149.85 -> discount 150
  assert.equal(total(c), 849);
});
test('half-up rounding on exact .5 discount', () => {
  setStock('E', 100);
  const c = createCart();
  addItem(c, 'E', 5, 1);
  applyCoupon(c, 10); // discount 0.5 -> 1
  assert.equal(total(c), 4);
});
test('stock cannot go negative', () => {
  setStock('F', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'F', 100, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('F'), 3);
  addItem(c, 'F', 100, 3);
  assert.equal(available('F'), 0);
  assert.throws(() => addItem(c, 'F', 100, 1), /INSUFFICIENT_STOCK/);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('G', 100);
  const c = createCart();
  addItem(c, 'G', 100, MAX_QTY_PER_LINE - 1);
  addItem(c, 'G', 100, 1);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'G', 100, 1), /QTY_LIMIT/);
  assert.equal(available('G'), 100 - MAX_QTY_PER_LINE);
});
