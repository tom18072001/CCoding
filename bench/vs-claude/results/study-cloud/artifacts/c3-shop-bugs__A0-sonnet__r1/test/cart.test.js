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

import { MAX_QTY_PER_LINE, removeItem } from '../src/cart.js';
import { available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to subtotal across lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 10000, 1);
  addItem(c, 'C2', 20000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 27000);
});
test('percent rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 904); // discount 100.5 -> 101
  assert.equal(applyPercent(999, 15), 849);  // discount 149.85 -> 150
  assert.ok(Number.isInteger(applyPercent(12345, 7)));
});
test('can buy exactly max quantity, not more', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 1000, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'D', 1000, 1), /QTY_LIMIT/);
});
test('stock never goes negative', () => {
  setStock('E', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'E', 1000, 5), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 3);
  addItem(c, 'E', 1000, 3);
  assert.equal(available('E'), 0);
  assert.throws(() => addItem(c, 'E', 1000, 1), /INSUFFICIENT_STOCK/);
  removeItem(c, 'E');
  assert.equal(available('E'), 3);
});
