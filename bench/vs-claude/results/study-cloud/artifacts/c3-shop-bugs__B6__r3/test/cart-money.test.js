import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';
import { setStock, available } from '../src/stock.js';

test('coupon applies once across multiple lines', () => {
  setStock('CM1', 100); setStock('CM2', 100);
  const c = createCart();
  addItem(c, 'CM1', 100000, 2);
  addItem(c, 'CM2', 50000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 225000);
});
test('half-up rounding: 15% of 333 discounts 50 (49.95)', () => {
  assert.equal(applyPercent(333, 15), 283);
});
test('half-up on exact .5: 10% of 5 discounts 1 (0.5 -> 1)', () => {
  assert.equal(applyPercent(5, 10), 4);
});
test('total is an integer with odd amounts', () => {
  setStock('CM3', 100);
  const c = createCart();
  addItem(c, 'CM3', 111, 3);
  applyCoupon(c, 15);
  assert.ok(Number.isInteger(total(c)));
  assert.equal(total(c), 283);
});
test('buying exactly MAX_QTY_PER_LINE succeeds', () => {
  setStock('CM4', 100);
  const c = createCart();
  addItem(c, 'CM4', 1000, MAX_QTY_PER_LINE);
  assert.equal(total(c), 10000);
});
test('11 in one go throws QTY_LIMIT', () => {
  setStock('CM5', 100);
  assert.throws(() => addItem(createCart(), 'CM5', 1000, 11), /QTY_LIMIT/);
});
test('10 then +1 throws QTY_LIMIT without reserving stock', () => {
  setStock('CM6', 100);
  const c = createCart();
  addItem(c, 'CM6', 1000, 10);
  assert.throws(() => addItem(c, 'CM6', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('CM6'), 90);
});
