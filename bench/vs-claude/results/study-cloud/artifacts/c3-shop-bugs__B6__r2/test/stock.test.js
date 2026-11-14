import test from 'node:test';
import assert from 'node:assert/strict';
import { setStock, available, reserve, release } from '../src/stock.js';

test('reserve exactly the stock succeeds and leaves 0', () => {
  setStock('S-EXACT', 5);
  reserve('S-EXACT', 5);
  assert.equal(available('S-EXACT'), 0);
});

test('reserve more than stock throws and leaves stock unchanged', () => {
  setStock('S-OVER', 3);
  assert.throws(() => reserve('S-OVER', 4), /INSUFFICIENT_STOCK/);
  assert.equal(available('S-OVER'), 3);
});

test('reserve unknown sku throws', () => {
  assert.throws(() => reserve('S-UNKNOWN', 1), /INSUFFICIENT_STOCK/);
  assert.equal(available('S-UNKNOWN'), 0);
});

test('reserve rejects non-positive or non-integer qty without changing stock', () => {
  setStock('S-INVALID', 5);
  for (const q of [0, -1, 1.5, NaN]) assert.throws(() => reserve('S-INVALID', q), /INVALID_QTY/);
  assert.equal(available('S-INVALID'), 5);
});

test('release adds stock back', () => {
  setStock('S-REL', 2);
  reserve('S-REL', 2);
  release('S-REL', 2);
  assert.equal(available('S-REL'), 2);
});
