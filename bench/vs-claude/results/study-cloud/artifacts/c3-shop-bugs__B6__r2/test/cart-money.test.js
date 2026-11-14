import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';
import { setStock } from '../src/stock.js';

test('applyPercent rounds half-up', () => {
  assert.equal(applyPercent(10010, 15), 8509); // 8508.5 -> 8509
  assert.equal(applyPercent(101, 12.5), 88);   // 88.375 -> 88
  assert.equal(applyPercent(1001, 50), 501);   // 500.5 -> 501
  assert.equal(applyPercent(100000, 0), 100000);
  assert.equal(applyPercent(100000, 100), 0);
});
test('coupon applies once across multiple lines, integer total', () => {
  setStock('M1', 100); setStock('M2', 100);
  const c = createCart();
  addItem(c, 'M1', 10010, 1);
  addItem(c, 'M2', 33333, 3);
  applyCoupon(c, 15);
  const t = total(c);
  assert.equal(t, applyPercent(10010 + 99999, 15));
  assert.ok(Number.isInteger(t));
});
test('exactly MAX_QTY_PER_LINE succeeds, more throws QTY_LIMIT', () => {
  setStock('L1', 100); setStock('L2', 100);
  const c = createCart();
  addItem(c, 'L1', 1000, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'L1', 1000, 1), /QTY_LIMIT/);
  assert.throws(() => addItem(c, 'L2', 1000, MAX_QTY_PER_LINE + 1), /QTY_LIMIT/);
});
test('accumulated adds beyond max throw QTY_LIMIT', () => {
  setStock('L3', 100);
  const c = createCart();
  addItem(c, 'L3', 1000, 6);
  assert.throws(() => addItem(c, 'L3', 1000, 5), /QTY_LIMIT/);
  addItem(c, 'L3', 1000, 4);
  assert.equal(c.lines[0].qty, 10);
});
