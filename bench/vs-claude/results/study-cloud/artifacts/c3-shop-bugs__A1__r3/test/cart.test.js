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

import { createCart as mk, addItem as add, removeItem, total as tot, applyCoupon as coupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock as set, available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to subtotal across multiple lines', () => {
  set('M1', 50); set('M2', 50);
  const c = mk();
  add(c, 'M1', 100000, 2); add(c, 'M2', 50000, 1);
  coupon(c, 10);
  assert.equal(tot(c), 225000);
});
test('total is an integer with half-up rounding', () => {
  set('R1', 50);
  const c = mk();
  add(c, 'R1', 5, 1);           // 5 * 10% = 0.5 discount -> rounds up to 1
  coupon(c, 10);
  assert.equal(tot(c), 4);
  assert.equal(applyPercent(999, 15), 849); // discount 149.85 -> 150
  assert.equal(applyPercent(1001, 33), 671); // discount 330.33 -> 330
  const c2 = mk(); set('R2', 50);
  add(c2, 'R2', 333, 3); coupon(c2, 7); // 999*7% = 69.93 -> 70
  assert.ok(Number.isInteger(tot(c2)));
  assert.equal(tot(c2), 929);
});
test('0% and 100% coupons', () => {
  set('Z', 5);
  const c = mk(); add(c, 'Z', 1234, 1);
  coupon(c, 0); assert.equal(tot(c), 1234);
  coupon(c, 100); assert.equal(tot(c), 0);
});
test('invalid coupon rejected', () => {
  const c = mk();
  assert.throws(() => coupon(c, -1), /BAD_COUPON/);
  assert.throws(() => coupon(c, 101), /BAD_COUPON/);
  assert.throws(() => coupon(c, NaN), /BAD_COUPON/);
});
test('stock cannot go negative', () => {
  set('S1', 3);
  const c = mk();
  assert.throws(() => add(c, 'S1', 1000, 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('S1'), 3);
  assert.equal(c.lines.length, 0);
  add(c, 'S1', 1000, 3);
  assert.equal(available('S1'), 0);
  assert.throws(() => add(c, 'S1', 1000, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('S1'), 0);
  assert.equal(c.lines[0].qty, 3);
});
test('unknown sku has no stock', () => {
  assert.throws(() => add(mk(), 'NOPE', 1, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('NOPE'), 0);
});
test('can buy exactly the max per line, not more', () => {
  set('Q', 100);
  const c = mk();
  add(c, 'Q', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => add(c, 'Q', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('Q'), 100 - MAX_QTY_PER_LINE);
  const d = mk();
  add(d, 'Q', 1000, MAX_QTY_PER_LINE - 1);
  add(d, 'Q', 1000, 1);
  assert.equal(d.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => add(mk(), 'Q', 1000, MAX_QTY_PER_LINE + 1), /QTY_LIMIT/);
});
test('removeItem releases stock', () => {
  set('T', 5);
  const c = mk(); add(c, 'T', 10, 5);
  removeItem(c, 'T');
  assert.equal(available('T'), 5);
});
