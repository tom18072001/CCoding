import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon } from '../src/cart.js';
import { setStock } from '../src/stock.js';

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
import { available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to multi-line subtotal', () => {
  setStock('C', 100); setStock('D', 100);
  const c = createCart();
  addItem(c, 'C', 10000, 1);
  addItem(c, 'D', 20000, 2);
  applyCoupon(c, 10);
  assert.equal(total(c), 45000);
});
test('percent rounds half-up to integer dong', () => {
  assert.equal(applyPercent(5, 10), 4);   // discount 0.5 -> 1
  assert.equal(applyPercent(104, 10), 94); // discount 10.4 -> 10
  assert.equal(applyPercent(105, 10), 94); // discount 10.5 -> 11
  const c = createCart();
  setStock('E', 100);
  addItem(c, 'E', 333, 1);
  applyCoupon(c, 15);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 283);
});
test('stock cannot go negative', () => {
  setStock('F', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'F', 100, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('F'), 3);
  addItem(c, 'F', 100, 3);
  assert.equal(available('F'), 0);
  assert.throws(() => addItem(c, 'F', 100, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('F'), 0);
});
test('can buy exactly max qty on a line, not more', () => {
  setStock('G', 100);
  const c = createCart();
  addItem(c, 'G', 100, 10);
  assert.equal(c.lines[0].qty, 10);
  assert.throws(() => addItem(c, 'G', 100, 1), /QTY_LIMIT/);
  const c2 = createCart();
  addItem(c2, 'G', 100, 6);
  addItem(c2, 'G', 100, 4);
  assert.equal(c2.lines[0].qty, 10);
});
