import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { applyPercent } from '../src/money.js';
import { setStock, available, reserve } from '../src/stock.js';

function priced(sku, price, qty, pct) {
  setStock(sku, 1000);
  const c = createCart();
  addItem(c, sku, price, qty);
  applyCoupon(c, pct);
  return c;
}

test('(a) coupon applied once on subtotal of multiple lines', () => {
  setStock('a1', 10); setStock('a2', 10);
  const c = createCart();
  addItem(c, 'a1', 100000, 1);
  addItem(c, 'a2', 50000, 1);
  applyCoupon(c, 10);
  assert.equal(total(c), 135000);
});

test('(b) half-up rounding to integer dong', () => {
  const half = total(priced('b1', 5, 1, 10)); // discount 0.5 -> 1
  assert.equal(half, 4);
  const below = total(priced('b2', 14, 1, 10)); // discount 1.4 -> 1
  assert.equal(below, 13);
  const above = total(priced('b3', 16, 1, 10)); // discount 1.6 -> 2
  assert.equal(above, 14);
  for (const v of [half, below, above]) assert.ok(Number.isInteger(v));
});

test('(c) applyPercent boundaries', () => {
  assert.equal(applyPercent(12345, 0), 12345);
  assert.equal(applyPercent(12345, 100), 0);
});

test('(d) stock never negative', () => {
  setStock('d1', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'd1', 1000, 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('d1'), 3);
  assert.equal(c.lines.find((l) => l.sku === 'd1'), undefined);
  assert.throws(() => reserve('d1', 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('d1'), 3);
  addItem(c, 'd1', 1000, 3);
  assert.equal(available('d1'), 0);
});

test('(e) exactly MAX_QTY_PER_LINE allowed, over limit rejected', () => {
  assert.equal(MAX_QTY_PER_LINE, 10);
  setStock('e1', 50);
  const c1 = createCart();
  addItem(c1, 'e1', 1000, 10);
  assert.equal(c1.lines[0].qty, 10);

  setStock('e2', 50);
  const c2 = createCart();
  addItem(c2, 'e2', 1000, 4);
  addItem(c2, 'e2', 1000, 6);
  assert.equal(c2.lines[0].qty, 10);

  setStock('e3', 50);
  const c3 = createCart();
  assert.throws(() => addItem(c3, 'e3', 1000, 11), { message: 'QTY_LIMIT' });
  assert.equal(available('e3'), 50);

  setStock('e4', 50);
  const c4 = createCart();
  addItem(c4, 'e4', 1000, 10);
  assert.throws(() => addItem(c4, 'e4', 1000, 1), { message: 'QTY_LIMIT' });
  assert.equal(available('e4'), 40);
  assert.equal(c4.lines[0].qty, 10);
});

test('(f) removeItem returns stock', () => {
  setStock('f1', 5);
  const c = createCart();
  addItem(c, 'f1', 1000, 3);
  assert.equal(available('f1'), 2);
  removeItem(c, 'f1');
  assert.equal(available('f1'), 5);
  assert.equal(c.lines.length, 0);
});
