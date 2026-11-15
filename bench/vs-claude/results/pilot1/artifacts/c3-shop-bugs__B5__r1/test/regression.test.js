import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, applyCoupon, total, removeItem, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';
import { applyPercent } from '../src/money.js';

test('coupon applies once, half-up integer', () => {
  setStock('a', 100); setStock('b', 100);
  const c = createCart();
  addItem(c, 'a', 15, 1); addItem(c, 'b', 15, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 27); // 30 - 3
  assert.equal(applyPercent(5, 10), 4); // discount 0.5 -> 1
  assert.equal(applyPercent(15, 10), 13); // 1.5 -> 2
  assert.equal(applyPercent(14, 10), 13); // 1.4 -> 1
});

test('stock never negative', () => {
  setStock('s', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 's', 100, 3), /INSUFFICIENT_STOCK/);
  assert.equal(available('s'), 2);
  addItem(c, 's', 100, 2);
  assert.throws(() => addItem(c, 's', 100, 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('s'), 0);
  removeItem(c, 's');
  assert.equal(available('s'), 2);
});

test('exact max quantity allowed, beyond rejected', () => {
  setStock('m', 100);
  const c = createCart();
  addItem(c, 'm', 1, MAX_QTY_PER_LINE);
  assert.throws(() => addItem(c, 'm', 1, 1), /QTY_LIMIT/);
  assert.equal(available('m'), 100 - MAX_QTY_PER_LINE);
});
