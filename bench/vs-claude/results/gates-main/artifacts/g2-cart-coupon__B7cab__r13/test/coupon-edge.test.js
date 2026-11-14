'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent 0, 100, 50 với tổng lẻ, tổng bằng 0', () => {
  assert.equal(applyCoupon(1000, pct(0)), 1000);
  assert.equal(applyCoupon(1000, pct(100)), 0);
  assert.equal(applyCoupon(101, pct(50)), 51);
  assert.equal(applyCoupon(0, pct(50)), 0);
  assert.equal(applyCoupon(0, fix(10)), 0);
});

test('percent không hợp lệ → RangeError', () => {
  for (const v of [-1, 100.01, NaN, Infinity, -Infinity, '5']) {
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError, String(v));
  }
});

test('fixed 0, đúng tổng, lớn hơn tổng', () => {
  assert.equal(applyCoupon(1000, fix(0)), 1000);
  assert.equal(applyCoupon(1000, fix(1000)), 0);
  assert.equal(applyCoupon(1000, fix(5000)), 0);
});

test('fixed không hợp lệ → RangeError', () => {
  for (const v of [-1, 1.5, NaN, Infinity, '5']) {
    assert.throws(() => applyCoupon(1000, fix(v)), RangeError, String(v));
  }
});

test('coupon không hợp lệ → RangeError', () => {
  for (const c of [null, undefined, 'percent', 5, {}, { type: 'percent' }, { type: 'fixed' },
    { type: 'bogus', value: 1 }, { value: 1 }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('totalCents âm hoặc không hữu hạn → RangeError', () => {
  for (const t of [-1, NaN, Infinity]) {
    assert.throws(() => applyCoupon(t, pct(10)), RangeError);
  }
});

test('toCents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(0), 0);
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
});

test('total kết hợp applyCoupon', () => {
  const t = total([{ price: 19.99, quantity: 2 }, { price: 1, quantity: 1 }]);
  assert.equal(t, 4098);
  assert.equal(applyCoupon(t, pct(10)), 3688); // 4098*0.9 = 3688.2
  assert.equal(applyCoupon(t, fix(98)), 4000);
  assert.equal(applyCoupon(total([]), pct(50)), 0);
});
