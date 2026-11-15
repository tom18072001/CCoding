'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent biên', () => {
  assert.equal(applyCoupon(1000, pct(0)), 1000);
  assert.equal(applyCoupon(1000, pct(100)), 0);
  assert.equal(applyCoupon(1000, pct(33.3)), Math.round((1000 * 66.7) / 100));
  assert.equal(applyCoupon(5, pct(50)), 3);
});

test('fixed biên', () => {
  assert.equal(applyCoupon(300, fix(300)), 0);
  assert.equal(applyCoupon(100, fix(300)), 0);
  assert.equal(applyCoupon(100, fix(0)), 100);
});

test('totalCents = 0', () => {
  assert.equal(applyCoupon(0, pct(50)), 0);
  assert.equal(applyCoupon(0, fix(10)), 0);
});

test('coupon sai ném RangeError', () => {
  const bad = [null, undefined, 'percent', {}, { value: 10 }, { type: 'bogus', value: 10 },
    { type: 'percent', value: '10' }, { type: 'fixed', value: '10' },
    pct(NaN), pct(Infinity), fix(NaN), fix(Infinity),
    pct(-1), pct(100.01), fix(-1), fix(1.5)];
  for (const c of bad) assert.throws(() => applyCoupon(1000, c), RangeError, JSON.stringify(c));
});

test('toCents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  for (const x of [-1, NaN, Infinity]) assert.throws(() => toCents(x), RangeError);
});

test('total', () => {
  assert.equal(total([]), 0);
  assert.equal(total([{ price: 1.5, quantity: 2 }, { price: 0.99, quantity: 3 }, { price: 10, quantity: 0 }]), 300 + 297);
});
