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
  addItem(c, 'C1', 50000, 1);
  addItem(c, 'C2', 50000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 90000);
});
test('percent discount rounds half-up to integer dong', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 1005, 1);
  applyCoupon(c, 10); // 904.5 -> 905
  assert.equal(total(c), 905);
  const c2 = createCart();
  addItem(c2, 'D', 999, 1);
  applyCoupon(c2, 33); // 669.33 -> 669
  assert.equal(total(c2), 669);
  assert.ok(Number.isInteger(total(c2)));
});
test('stock cannot go negative', () => {
  setStock('E', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'E', 1000, 3), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 2);
  assert.equal(c.lines.length, 0);
  addItem(c, 'E', 1000, 2);
  assert.equal(available('E'), 0);
  assert.throws(() => addItem(c, 'E', 1000, 1), /INSUFFICIENT_STOCK/);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('F', 100);
  const c = createCart();
  addItem(c, 'F', 1000, MAX_QTY_PER_LINE);
  assert.equal(total(c), 1000 * MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'F', 1000, 1), /QTY_LIMIT/);
  const c2 = createCart();
  addItem(c2, 'F', 1000, MAX_QTY_PER_LINE - 1);
  addItem(c2, 'F', 1000, 1);
  assert.equal(c2.lines[0].qty, MAX_QTY_PER_LINE);
});
