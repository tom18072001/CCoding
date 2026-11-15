import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';

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

test('10% coupon over multiple lines', () => {
  setStock('M1', 100); setStock('M2', 100);
  const c = createCart();
  addItem(c, 'M1', 100000, 1);
  addItem(c, 'M2', 50000, 2);
  applyCoupon(c, 10);
  assert.equal(total(c), 180000);
});
test('coupon applies once, result is integer (half-up)', () => {
  setStock('H1', 100); setStock('H2', 100);
  const c = createCart();
  addItem(c, 'H1', 33333, 1);
  applyCoupon(c, 15); // 4999.95 -> discount 5000 -> 28333
  assert.equal(total(c), 28333);
  const d = createCart();
  addItem(d, 'H2', 10, 1);
  applyCoupon(d, 15); // discount 1.5 -> 2 -> 8
  assert.equal(total(d), 8);
  assert.ok(Number.isInteger(total(d)));
});
test('exactly MAX qty allowed in one call', () => {
  setStock('Q1', 100);
  const c = createCart();
  addItem(c, 'Q1', 1000, 10);
  assert.equal(c.lines[0].qty, 10);
});
test('exactly MAX qty allowed cumulatively (4+6), 11 throws QTY_LIMIT', () => {
  setStock('Q2', 100); setStock('Q3', 100);
  const c = createCart();
  addItem(c, 'Q2', 1000, 4);
  addItem(c, 'Q2', 1000, 6);
  assert.equal(c.lines[0].qty, 10);
  assert.throws(() => addItem(c, 'Q2', 1000, 1), /QTY_LIMIT/);
  assert.throws(() => addItem(c, 'Q3', 1000, 11), /QTY_LIMIT/);
  assert.equal(available('Q3'), 100);
});
test('BAD_QTY', () => {
  setStock('Q4', 5);
  const c = createCart();
  for (const q of [0, -1, 1.5, NaN]) assert.throws(() => addItem(c, 'Q4', 1, q), /BAD_QTY/);
});
