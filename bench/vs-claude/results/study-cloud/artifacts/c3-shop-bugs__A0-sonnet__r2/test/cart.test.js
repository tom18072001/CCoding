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
import { MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to subtotal, not per line', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 100000, 1);
  addItem(c, 'C2', 50000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 135000);
});
test('percent discount rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 904); // discount 100.5 -> 101
  assert.equal(applyPercent(999, 15), 849);  // discount 149.85 -> 150
  const c = createCart();
  setStock('D', 100);
  addItem(c, 'D', 3333, 1);
  applyCoupon(c, 7);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 3100);
});
test('stock cannot go negative', () => {
  setStock('E', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'E', 1000, 5), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 3);
  addItem(c, 'E', 1000, 3);
  assert.equal(available('E'), 0);
  assert.throws(() => addItem(c, 'E', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('E'), 0);
});
test('can buy exactly MAX_QTY_PER_LINE but not more', () => {
  setStock('F', 100);
  const c = createCart();
  addItem(c, 'F', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'F', 1000, 1), /QTY_LIMIT/);
  const c2 = createCart();
  addItem(c2, 'F', 1000, MAX_QTY_PER_LINE - 1);
  addItem(c2, 'F', 1000, 1);
  assert.equal(c2.lines[0].qty, MAX_QTY_PER_LINE);
});
