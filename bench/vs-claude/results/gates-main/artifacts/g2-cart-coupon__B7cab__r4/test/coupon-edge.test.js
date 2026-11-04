'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
  assert.equal(applyCoupon(0, pct(50)), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(1, pct(50)), 1);
  assert.equal(applyCoupon(3, pct(50)), 2);
});

test('fixed 0 và lớn hơn total', () => {
  assert.equal(applyCoupon(500, fix(0)), 500);
  assert.equal(applyCoupon(500, fix(500)), 0);
  assert.equal(applyCoupon(500, fix(501)), 0);
});

test('fixed sai → RangeError', () => {
  for (const v of [1.5, -1, '100', NaN, Infinity, undefined, null])
    assert.throws(() => applyCoupon(1000, fix(v)), RangeError, String(v));
});

test('percent sai → RangeError', () => {
  for (const v of [-1, 100.01, NaN, Infinity, -Infinity, '10', undefined])
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError, String(v));
});

test('coupon sai dạng → RangeError', () => {
  for (const c of [null, undefined, {}, { value: 10 }, { type: 'bogus', value: 10 }, 'percent', 10])
    assert.throws(() => applyCoupon(1000, c), RangeError);
});

test('totalCents không nguyên hoặc âm → RangeError', () => {
  for (const t of [1.5, -1, NaN, Infinity, '100', undefined])
    assert.throws(() => applyCoupon(t, fix(1)), RangeError);
});

test('total() kết hợp applyCoupon', () => {
  const t = total([{ price: 19.99, quantity: 1 }]);
  assert.equal(t, 1999);
  assert.equal(applyCoupon(t, pct(10)), 1799);
  assert.equal(applyCoupon(t, fix(999)), 1000);
});
