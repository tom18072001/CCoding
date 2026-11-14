import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available, reserve } from '../src/stock.js';

function cartWith(items, pct) {
  const c = createCart();
  for (const [sku, price, qty] of items) { setStock(sku, 1000); addItem(c, sku, price, qty); }
  if (pct !== undefined) applyCoupon(c, pct);
  return c;
}

// --- Coupon ---
test('coupon applies once on multi-line cart', () => {
  const c = cartWith([['RC-A1', 30000, 1], ['RC-A2', 70000, 1]], 10);
  assert.equal(total(c), 90000);
});
test('half-up rounding: 15 x 10% -> discount 2 -> 13 (G1)', () => {
  const c = cartWith([['RC-B1', 15, 1]], 10);
  assert.equal(total(c), 13);
});
test('non-.5 case: 12345 x 7% -> 11481', () => {
  const c = cartWith([['RC-C1', 12345, 1]], 7);
  assert.equal(total(c), 11481);
});
test('result is always an integer', () => {
  for (const [price, pct] of [[999, 33], [12345, 7], [1, 50], [77777, 15], [15, 10]]) {
    const c = cartWith([['RC-D1', price, 3]], pct);
    assert.ok(Number.isInteger(total(c)), `${price}/${pct}`);
  }
});
test('coupon 0% and 100%', () => {
  const c = cartWith([['RC-E1', 25000, 2]], 0);
  assert.equal(total(c), 50000);
  applyCoupon(c, 100);
  assert.equal(total(c), 0);
});
test('total() is repeatable', () => {
  const c = cartWith([['RC-F1', 30000, 1], ['RC-F2', 70000, 1]], 10);
  assert.equal(total(c), 90000);
  assert.equal(total(c), 90000);
  assert.equal(total(c), 90000);
});

// --- Stock ---
test('reserve over stock throws and leaves stock unchanged', () => {
  setStock('RS-1', 3);
  assert.throws(() => reserve('RS-1', 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('RS-1'), 3);
});
test('addItem over stock throws, cart unchanged, stock not negative', () => {
  setStock('RS-2', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'RS-2', 1000, 3), { message: 'INSUFFICIENT_STOCK' });
  assert.deepEqual(c.lines, []);
  assert.equal(available('RS-2'), 2);
});
test('addItem over remaining stock on existing line leaves line unchanged', () => {
  setStock('RS-3', 5);
  const c = createCart();
  addItem(c, 'RS-3', 1000, 4);
  assert.throws(() => addItem(c, 'RS-3', 1000, 2), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(c.lines[0].qty, 4);
  assert.equal(available('RS-3'), 1);
});
test('buying exactly the whole stock leaves 0', () => {
  setStock('RS-4', 5);
  const c = createCart();
  addItem(c, 'RS-4', 1000, 5);
  assert.equal(available('RS-4'), 0);
});
test('removeItem returns stock', () => {
  setStock('RS-5', 5);
  const c = createCart();
  addItem(c, 'RS-5', 1000, 3);
  assert.equal(available('RS-5'), 2);
  removeItem(c, 'RS-5');
  assert.equal(available('RS-5'), 5);
  assert.deepEqual(c.lines, []);
});

// --- Quantity limit ---
test('MAX_QTY_PER_LINE is 10', () => assert.equal(MAX_QTY_PER_LINE, 10));
test('adding exactly MAX_QTY_PER_LINE succeeds', () => {
  setStock('Q-1', 100);
  const c = createCart();
  addItem(c, 'Q-1', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, 10);
});
test('accumulating 6 + 4 = 10 succeeds', () => {
  setStock('Q-2', 100);
  const c = createCart();
  addItem(c, 'Q-2', 1000, 6);
  addItem(c, 'Q-2', 1000, 4);
  assert.equal(c.lines[0].qty, 10);
});
test('11 throws QTY_LIMIT and does not touch stock', () => {
  setStock('Q-3', 100);
  const c = createCart();
  assert.throws(() => addItem(c, 'Q-3', 1000, 11), { message: 'QTY_LIMIT' });
  assert.equal(available('Q-3'), 100);
});
test('10 + 1 throws QTY_LIMIT, line stays 10', () => {
  setStock('Q-4', 100);
  const c = createCart();
  addItem(c, 'Q-4', 1000, 10);
  assert.throws(() => addItem(c, 'Q-4', 1000, 1), { message: 'QTY_LIMIT' });
  assert.equal(c.lines[0].qty, 10);
  assert.equal(available('Q-4'), 90);
});
