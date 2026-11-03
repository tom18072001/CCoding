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

import { removeItem, MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';
import { available } from '../src/stock.js';

test('coupon applies once across multiple lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 100000, 1);
  addItem(c, 'C2', 50000, 2);
  applyCoupon(c, 10);
  assert.equal(total(c), 180000);
});
test('applyPercent rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 905);   // 904.5 -> 905
  assert.equal(applyPercent(999, 15), 849);    // 849.15 -> 849
  assert.equal(applyPercent(1001, 33), 671);   // 670.67 -> 671
  assert.equal(applyPercent(1000, 0), 1000);
  assert.equal(applyPercent(1000, 100), 0);
});
test('total is always an integer with fractional-result coupon', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 3333, 3);
  applyCoupon(c, 7);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 9299); // 9999*0.93 = 9299.07
});
test('invalid coupon rejected', () => {
  const c = createCart();
  assert.throws(() => applyCoupon(c, -1), /BAD_COUPON/);
  assert.throws(() => applyCoupon(c, 101), /BAD_COUPON/);
  assert.throws(() => applyCoupon(c, NaN), /BAD_COUPON/);
});
test('stock cannot go negative; exact stock can be bought', () => {
  setStock('S', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'S', 1000, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 3);
  assert.equal(c.lines.length, 0);
  addItem(c, 'S', 1000, 3);
  assert.equal(available('S'), 0);
  assert.throws(() => addItem(c, 'S', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 0);
  removeItem(c, 'S');
  assert.equal(available('S'), 3);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('M', 100);
  const c = createCart();
  addItem(c, 'M', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'M', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('M'), 100 - MAX_QTY_PER_LINE);
  const d = createCart();
  addItem(d, 'M', 1000, MAX_QTY_PER_LINE - 1);
  addItem(d, 'M', 1000, 1);
  assert.equal(d.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(createCart(), 'M', 1000, MAX_QTY_PER_LINE + 1), /QTY_LIMIT/);
});
