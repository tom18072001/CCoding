import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';
import { MAX_QTY_PER_LINE } from '../src/cart.js';

test('regression: coupon applied once, half-up integer', () => {
  assert.equal(applyPercent(1005, 10), 904);
  assert.equal(applyPercent(1000, 15), 850);
  setStock('r1', 100); setStock('r2', 100);
  const c = createCart();
  addItem(c, 'r1', 333, 1); addItem(c, 'r2', 100, 1); applyCoupon(c, 10);
  assert.equal(total(c), 390);
});

test('regression: stock never negative', () => {
  setStock('s1', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 's1', 10, 3), /INSUFFICIENT_STOCK/);
  assert.equal(available('s1'), 2);
  addItem(c, 's1', 10, 2);
  assert.equal(available('s1'), 0);
  assert.throws(() => addItem(c, 's1', 10, 1), /INSUFFICIENT_STOCK/);
});

test('regression: exact max qty allowed, over max rejected', () => {
  setStock('m1', 100);
  const c = createCart();
  addItem(c, 'm1', 10, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'm1', 10, 1), /QTY_LIMIT/);
  assert.equal(available('m1'), 100 - MAX_QTY_PER_LINE);
});

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
