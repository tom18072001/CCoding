import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
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

test('coupon applied once across multiple lines, integer result', () => {
  setStock('C', 100); setStock('D', 100);
  const c = createCart();
  addItem(c, 'C', 10001, 1);
  addItem(c, 'D', 5, 3);
  applyCoupon(c, 10); // subtotal 10016 -> discount 1001.6 -> 1002
  assert.equal(total(c), 9014);
});
test('percentage rounds half-up', () => {
  setStock('E', 100);
  const c = createCart();
  addItem(c, 'E', 1005, 1);
  applyCoupon(c, 10); // discount 100.5 -> 101
  assert.equal(total(c), 904);
});
test('stock cannot go negative', () => {
  setStock('F', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'F', 100, 3), /INSUFFICIENT_STOCK/);
  addItem(c, 'F', 100, 2);
  assert.equal(available('F'), 0);
  assert.throws(() => addItem(c, 'F', 100, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('F'), 0);
});
test('can buy exactly MAX_QTY_PER_LINE, not more', () => {
  setStock('G', 100);
  const c = createCart();
  addItem(c, 'G', 100, MAX_QTY_PER_LINE);
  assert.equal(total(c), 100 * MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'G', 100, 1), /QTY_LIMIT/);
  assert.equal(available('G'), 100 - MAX_QTY_PER_LINE);
});
