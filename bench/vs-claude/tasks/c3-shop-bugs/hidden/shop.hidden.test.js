import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available, reserve } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applied once to subtotal', () => {
  setStock('H1', 100); const c = createCart();
  addItem(c, 'H1', 200000, 2); applyCoupon(c, 25);
  assert.equal(total(c), 300000);
});
test('rounding half-up to integer dong', () => {
  assert.equal(applyPercent(33333, 10), 30000);   // discount 3333.3 -> 3333
  assert.equal(applyPercent(15, 10), 13);         // discount 1.5 -> 2
  assert.ok(Number.isInteger(applyPercent(99999, 7)));
});
test('cart total is integer with odd prices', () => {
  setStock('H2', 100); const c = createCart();
  addItem(c, 'H2', 12345, 3); applyCoupon(c, 15);
  assert.equal(total(c), 37035 - 5555);
});
test('stock cannot go negative', () => {
  setStock('H3', 2);
  assert.throws(() => reserve('H3', 3), /INSUFFICIENT_STOCK/);
  assert.equal(available('H3'), 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'H3', 1000, 3), /INSUFFICIENT_STOCK/);
  assert.equal(available('H3'), 2);
});
test('can buy exactly the max per line, not more', () => {
  setStock('H4', 100); const c = createCart();
  addItem(c, 'H4', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'H4', 1000, 1), /QTY_LIMIT/);
});
test('remove releases stock', () => {
  setStock('H5', 5); const c = createCart();
  addItem(c, 'H5', 1000, 5); removeItem(c, 'H5');
  assert.equal(available('H5'), 5);
});
