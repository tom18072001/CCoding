import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
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

import { applyPercent } from '../src/money.js';
import { available } from '../src/stock.js';

test('coupon applies once to subtotal across multiple lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 50000, 2);
  addItem(c, 'C2', 20000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 108000);
});
test('percent rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 904); // discount 100.5 -> 101
  assert.equal(applyPercent(999, 15), 849);  // discount 149.85 -> 150
  assert.equal(applyPercent(1, 50), 0);      // discount 0.5 -> 1
  assert.equal(applyPercent(1234, 0), 1234);
  assert.equal(applyPercent(1234, 100), 0);
});
test('total is always an integer with coupon', () => {
  setStock('D', 100);
  const c = createCart();
  addItem(c, 'D', 3333, 3);
  applyCoupon(c, 7);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 9299); // 9999 - round(699.93)=700
});
test('stock cannot go negative', () => {
  setStock('S', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'S', 1000, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 3);
  assert.equal(c.lines.length, 0);
  addItem(c, 'S', 1000, 3);
  assert.equal(available('S'), 0);
  assert.throws(() => addItem(c, 'S', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('S'), 0);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('M', 100);
  const c = createCart();
  addItem(c, 'M', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'M', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('M'), 100 - MAX_QTY_PER_LINE);
});
test('max reached across several adds', () => {
  setStock('N', 100);
  const c = createCart();
  addItem(c, 'N', 1000, 4);
  addItem(c, 'N', 1000, 6);
  assert.equal(c.lines[0].qty, 10);
});
test('bad coupon rejected', () => {
  const c = createCart();
  assert.throws(() => applyCoupon(c, 101), /BAD_COUPON/);
  assert.throws(() => applyCoupon(c, -1), /BAD_COUPON/);
});
