import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available, reserve } from '../src/stock.js';

test('coupon applies once on multi-line cart', () => {
  setStock('R-A1', 10); setStock('R-A2', 10);
  const c = createCart();
  addItem(c, 'R-A1', 100000, 1);
  addItem(c, 'R-A2', 50000, 1);
  applyCoupon(c, 10);
  const t = total(c);
  assert.equal(t, 135000);
  assert.ok(Number.isInteger(t));
});

test('percent rounds half-up to integer dong (round up)', () => {
  setStock('R-B1', 10);
  const c = createCart();
  addItem(c, 'R-B1', 12345, 1);
  applyCoupon(c, 10);
  const t = total(c);
  assert.ok(Number.isInteger(t));
  assert.equal(t, 11110);
});

test('percent rounds to integer dong (round down)', () => {
  setStock('R-B2', 10);
  const c = createCart();
  addItem(c, 'R-B2', 12344, 1);
  applyCoupon(c, 10);
  const t = total(c);
  assert.ok(Number.isInteger(t));
  assert.equal(t, 11110);
});

test('coupon 0% and 100%', () => {
  setStock('R-C1', 10);
  const c = createCart();
  addItem(c, 'R-C1', 12345, 2);
  applyCoupon(c, 0);
  assert.equal(total(c), 24690);
  applyCoupon(c, 100);
  assert.equal(total(c), 0);
});

test('reserve over stock throws and keeps stock', () => {
  setStock('R-D1', 3);
  assert.throws(() => reserve('R-D1', 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('R-D1'), 3);
});

test('addItem over stock throws, stock unchanged, no line added', () => {
  setStock('R-D2', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'R-D2', 1000, 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('R-D2'), 3);
  assert.equal(c.lines.length, 0);
});

test('buying exactly the stock leaves 0', () => {
  setStock('R-E1', 5);
  const c = createCart();
  addItem(c, 'R-E1', 1000, 5);
  assert.equal(available('R-E1'), 0);
  assert.throws(() => addItem(c, 'R-E1', 1000, 1), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('R-E1'), 0);
});

test('exact MAX_QTY_PER_LINE allowed, above throws QTY_LIMIT', () => {
  assert.equal(MAX_QTY_PER_LINE, 10);
  setStock('R-F1', 100);
  const c = createCart();
  addItem(c, 'R-F1', 1000, 10);
  assert.equal(c.lines[0].qty, 10);

  setStock('R-F2', 100);
  const c2 = createCart();
  assert.throws(() => addItem(c2, 'R-F2', 1000, 11), { message: 'QTY_LIMIT' });
  assert.equal(c2.lines.length, 0);
  assert.equal(available('R-F2'), 100);
});

test('accumulated qty: 6+4 ok, 6+5 throws', () => {
  setStock('R-F3', 100);
  const c = createCart();
  addItem(c, 'R-F3', 1000, 6);
  addItem(c, 'R-F3', 1000, 4);
  assert.equal(c.lines[0].qty, 10);

  setStock('R-F4', 100);
  const c2 = createCart();
  addItem(c2, 'R-F4', 1000, 6);
  assert.throws(() => addItem(c2, 'R-F4', 1000, 5), { message: 'QTY_LIMIT' });
  assert.equal(c2.lines[0].qty, 6);
  assert.equal(available('R-F4'), 94);
});

test('removeItem returns stock', () => {
  setStock('R-G1', 10);
  const c = createCart();
  addItem(c, 'R-G1', 1000, 4);
  assert.equal(available('R-G1'), 6);
  removeItem(c, 'R-G1');
  assert.equal(available('R-G1'), 10);
  assert.equal(c.lines.length, 0);
});
