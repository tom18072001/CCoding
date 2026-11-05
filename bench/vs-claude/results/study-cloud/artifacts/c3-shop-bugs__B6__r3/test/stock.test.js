import test from 'node:test';
import assert from 'node:assert/strict';
import { setStock, available, reserve, release } from '../src/stock.js';
import { createCart, addItem } from '../src/cart.js';

test('reserve beyond stock throws and leaves stock unchanged', () => {
  setStock('ST1', 5);
  assert.throws(() => reserve('ST1', 6), /INSUFFICIENT_STOCK/);
  assert.equal(available('ST1'), 5);
});
test('reserve exactly the stock succeeds and reaches 0', () => {
  setStock('ST2', 5);
  reserve('ST2', 5);
  assert.equal(available('ST2'), 0);
});
test('release after reserve restores stock', () => {
  setStock('ST3', 5);
  reserve('ST3', 3);
  release('ST3', 3);
  assert.equal(available('ST3'), 5);
});
test('unknown sku reserve 1 throws and stays 0', () => {
  assert.throws(() => reserve('ST-NONE', 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('ST-NONE'), 0);
});
test('addItem beyond stock throws and creates no line', () => {
  setStock('ST4', 2);
  const c = createCart();
  assert.throws(() => addItem(c, 'ST4', 1000, 3), /INSUFFICIENT_STOCK/);
  assert.equal(c.lines.length, 0);
  assert.equal(available('ST4'), 2);
});
test('addItem beyond stock on existing line leaves line unchanged', () => {
  setStock('ST5', 3);
  const c = createCart();
  addItem(c, 'ST5', 1000, 2);
  assert.throws(() => addItem(c, 'ST5', 1000, 2), /INSUFFICIENT_STOCK/);
  assert.equal(c.lines[0].qty, 2);
  assert.equal(available('ST5'), 1);
});
