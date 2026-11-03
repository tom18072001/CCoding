import test from 'node:test';
import assert from 'node:assert/strict';
import { setStock, available, reserve, release } from '../src/stock.js';
import { createCart, addItem } from '../src/cart.js';

test('reserve over stock throws and leaves stock unchanged', () => {
  setStock('S2-A', 3);
  assert.throws(() => reserve('S2-A', 4), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('S2-A'), 3);
});
test('reserve exactly the stock succeeds, leaving 0', () => {
  setStock('S2-B', 5);
  reserve('S2-B', 5);
  assert.equal(available('S2-B'), 0);
});
test('unknown sku reserve 1 throws', () => {
  assert.throws(() => reserve('S2-NONE', 1), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(available('S2-NONE'), 0);
});
test('release adds stock back', () => {
  setStock('S2-C', 1);
  reserve('S2-C', 1);
  release('S2-C', 1);
  assert.equal(available('S2-C'), 1);
});
test('addItem over stock throws, cart empty, stock unchanged', () => {
  setStock('S2-D', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'S2-D', 1000, 3), { message: 'INSUFFICIENT_STOCK' });
  assert.equal(c.lines.length, 0);
  assert.equal(available('S2-D'), 2);
});
