import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, total, applyCoupon, MAX_QTY_PER_LINE } from '../src/cart.js';
import { setStock, available } from '../src/stock.js';

function cartWith(items, pct) {
  const c = createCart();
  for (const [sku, price, qty] of items) { setStock(sku, 100); addItem(c, sku, price, qty); }
  if (pct !== undefined) applyCoupon(c, pct);
  return c;
}

test('coupon is applied once across multiple lines', () => {
  const c = cartWith([['RA', 100000, 1], ['RB', 50000, 2]], 10);
  assert.equal(total(c), 180000);
});

test('half-up rounding: .5 rounds up', () => {
  const t = total(cartWith([['RC', 10010, 1]], 5)); // discount 500.5 -> 501
  assert.equal(t, 9509);
  assert.ok(Number.isInteger(t));
});

test('rounding: .45 rounds down', () => {
  const t = total(cartWith([['RD', 10009, 1]], 5)); // discount 500.45 -> 500
  assert.equal(t, 9509);
  assert.ok(Number.isInteger(t));
});

test('indivisible lines: coupon applied once to subtotal', () => {
  // subtotal 30, 5% = 1.5 -> 2 -> 28 (per-line rounding would give 27)
  const t = total(cartWith([['RE1', 10, 1], ['RE2', 10, 1], ['RE3', 10, 1]], 5));
  assert.equal(t, 28);
  // subtotal 1005 + 2003 + 2331 = 5339, 15% = 800.85 -> 801 -> 4538
  const t2 = total(cartWith([['RF1', 1005, 1], ['RF2', 2003, 1], ['RF3', 777, 3]], 15));
  assert.equal(t2, 4538);
  assert.ok(Number.isInteger(t2));
});

test('stock: insufficient stock throws and leaves state unchanged', () => {
  setStock('S', 3);
  const c = createCart();
  assert.throws(() => addItem(c, 'S', 1000, 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('S'), 3);
  assert.equal(c.lines.length, 0);
});

test('stock: reserving exactly the stock is allowed, one more throws, never negative', () => {
  setStock('S2', 3);
  const c = createCart();
  addItem(c, 'S2', 1000, 3);
  assert.equal(available('S2'), 0);
  assert.throws(() => addItem(c, 'S2', 1000, 1), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('S2'), 0);
  assert.equal(c.lines[0].qty, 3);
});

test('max qty: exactly MAX_QTY_PER_LINE in one call succeeds', () => {
  assert.equal(MAX_QTY_PER_LINE, 10);
  setStock('M1', 100);
  const c = createCart();
  addItem(c, 'M1', 1000, MAX_QTY_PER_LINE);
  assert.equal(c.lines[0].qty, 10);
});

test('max qty: 6+4 across two calls succeeds', () => {
  setStock('M2', 100);
  const c = createCart();
  addItem(c, 'M2', 1000, 6);
  addItem(c, 'M2', 1000, 4);
  assert.equal(c.lines[0].qty, 10);
});

test('max qty: 11 or 10+1 throws QTY_LIMIT without touching stock', () => {
  setStock('M3', 100);
  const c = createCart();
  assert.throws(() => addItem(c, 'M3', 1000, 11), { message: 'QTY_LIMIT' });
  assert.equal(available('M3'), 100);
  addItem(c, 'M3', 1000, 10);
  assert.throws(() => addItem(c, 'M3', 1000, 1), { message: 'QTY_LIMIT' });
  assert.equal(available('M3'), 90);
  assert.equal(c.lines[0].qty, 10);
});

test('removeItem returns stock', () => {
  setStock('R1', 5);
  const c = createCart();
  addItem(c, 'R1', 1000, 4);
  assert.equal(available('R1'), 1);
  removeItem(c, 'R1');
  assert.equal(available('R1'), 5);
  assert.equal(c.lines.length, 0);
});
