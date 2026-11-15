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

import { MAX_QTY_PER_LINE } from '../src/cart.js';
import { available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to subtotal across multiple lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 100000, 1);
  addItem(c, 'C2', 50000, 2);
  applyCoupon(c, 10);
  assert.equal(total(c), 180000);
});
test('percent discount rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 904); // discount 100.5 -> 101
  assert.equal(applyPercent(999, 15), 849);  // discount 149.85 -> 150
  const c = createCart();
  setStock('D', 100);
  addItem(c, 'D', 333, 3);
  applyCoupon(c, 15);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 849);
});
test('stock cannot go negative', () => {
  setStock('S', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'S', 1000, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 3);
  addItem(c, 'S', 1000, 3);
  assert.equal(available('S'), 0);
  assert.throws(() => addItem(c, 'S', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 0);
});
test('can buy exactly max quantity, not more', () => {
  setStock('M', 100);
  const c = createCart();
  addItem(c, 'M', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'M', 1000, 1), /QTY_LIMIT/);
  const c2 = createCart();
  addItem(c2, 'M', 1000, 9);
  addItem(c2, 'M', 1000, 1);
  assert.equal(c2.lines[0].qty, 10);
});
