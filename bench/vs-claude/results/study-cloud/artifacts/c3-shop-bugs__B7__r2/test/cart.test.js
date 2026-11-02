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
import { available } from '../src/stock.js';
import { MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once to subtotal across lines', () => {
  setStock('C1', 100); setStock('C2', 100);
  const c = createCart();
  addItem(c, 'C1', 10000, 1);
  addItem(c, 'C2', 30000, 1);
  applyCoupon(c, 25);
  assert.equal(total(c), 30000);
});
test('percent discount rounds half-up to integer dong', () => {
  assert.equal(applyPercent(15, 10), 13); // discount 1.5 -> 2
  assert.equal(applyPercent(14, 10), 13); // discount 1.4 -> 1
  assert.equal(applyPercent(1005, 15), 854); // discount 150.75 -> 151
  assert.ok(Number.isInteger(applyPercent(999, 33)));
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
test('can buy exactly max qty on a line, not more', () => {
  setStock('M', 100);
  const c = createCart();
  addItem(c, 'M', 1000, MAX_QTY_PER_LINE);
  assert.equal(total(c), 1000 * MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'M', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('M'), 100 - MAX_QTY_PER_LINE);
});
test('10% coupon on 100000', () => {
  setStock('B', 100);
  const c = createCart();
  addItem(c, 'B', 100000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 90000);
});
import { reserve } from '../src/stock.js';

test('half-up at exactly 0.5 dong', () => {
  assert.equal(applyPercent(1, 50), 0); // discount 0.5 -> 1
  assert.equal(applyPercent(5, 10), 4); // discount 0.5 -> 1
});
test('0% coupon leaves total unchanged', () => {
  setStock('Z', 10);
  const c = createCart();
  addItem(c, 'Z', 12345, 3);
  applyCoupon(c, 0);
  assert.equal(total(c), 37035);
});
test('empty cart totals 0, with or without coupon', () => {
  const c = createCart();
  assert.equal(total(c), 0);
  applyCoupon(c, 20);
  assert.equal(total(c), 0);
});
test('repeated addItem on same sku accumulates up to exactly max', () => {
  setStock('R', 100);
  const c = createCart();
  addItem(c, 'R', 1000, 4);
  addItem(c, 'R', 1000, 6);
  assert.equal(c.lines.length, 1);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'R', 1000, 1), /QTY_LIMIT/);
  assert.equal(available('R'), 100 - MAX_QTY_PER_LINE);
});
test('reserve with qty equal to stock succeeds and leaves 0', () => {
  setStock('E', 5);
  reserve('E', 5);
  assert.equal(available('E'), 0);
  assert.throws(() => reserve('E', 1), /INSUFFICIENT_STOCK/);
});
