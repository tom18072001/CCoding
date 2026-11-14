import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

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

test('coupon applies once across multiple lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 10000, 1);
  addItem(c, 'C2', 20000, 2);
  applyCoupon(c, 10);
  assert.equal(total(c), 45000);
});
test('percent discount rounds half-up to integer dong', () => {
  assert.equal(applyPercent(1005, 10), 904); // discount 100.5 -> 101
  assert.equal(applyPercent(999, 15), 849); // discount 149.85 -> 150
  assert.ok(Number.isInteger(applyPercent(12345, 7)));
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
test('can buy exactly MAX_QTY_PER_LINE but not more', () => {
  setStock('M', 100);
  const c = createCart();
  addItem(c, 'M', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'M', 1000, 1), /QTY_LIMIT/);
});
test('edge: pct 0, pct 100 and empty cart', () => {
  assert.equal(applyPercent(12345, 0), 12345);
  assert.equal(applyPercent(12345, 100), 0);
  const c = createCart();
  assert.equal(total(c), 0);
  applyCoupon(c, 50);
  assert.equal(total(c), 0);
});
test('removeItem releases stock', () => {
  setStock('R', 5);
  const c = createCart();
  addItem(c, 'R', 1000, 4);
  assert.equal(available('R'), 1);
  removeItem(c, 'R');
  assert.equal(available('R'), 5);
  assert.equal(c.lines.length, 0);
});
test('existing line can grow to exactly MAX_QTY_PER_LINE', () => {
  setStock('G', 100);
  const c = createCart();
  addItem(c, 'G', 1000, MAX_QTY_PER_LINE - 3);
  addItem(c, 'G', 1000, 3);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.equal(available('G'), 100 - MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'G', 1000, 1), /QTY_LIMIT/);
});
