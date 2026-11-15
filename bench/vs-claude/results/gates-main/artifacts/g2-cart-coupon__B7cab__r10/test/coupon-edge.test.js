'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');

test('percent biên', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
  // 1000 * 66.5% = 665 ; 10 * 66.5 / 100 = 6.65 -> 7 ; nửa lên: 1 * 50% = 0.5 -> 1
  assert.equal(applyCoupon(1000, { type: 'percent', value: 33.5 }), 665);
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
});

test('fixed biên', () => {
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 0 }), 100);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 100 }), 0);
});

test('fixed không hợp lệ', () => {
  for (const v of [1.5, -1]) {
    assert.throws(() => applyCoupon(1000, { type: 'fixed', value: v }), RangeError);
  }
});

test('percent ngoài khoảng', () => {
  for (const v of [-1, 100.01]) {
    assert.throws(() => applyCoupon(1000, { type: 'percent', value: v }), RangeError);
  }
});

test('coupon sai', () => {
  const bad = [null, undefined, 'percent', 10, {}, { type: 'x', value: 1 },
    { type: 'percent', value: '10' }, { type: 'percent' }, { type: 'fixed', value: NaN },
    { type: 'percent', value: Infinity }];
  for (const c of bad) assert.throws(() => applyCoupon(1000, c), RangeError);
});

test('totalCents không hợp lệ', () => {
  for (const t of [NaN, Infinity, -Infinity, -1, 10.5, '100', undefined, null]) {
    assert.throws(() => applyCoupon(t, { type: 'percent', value: 10 }), RangeError);
  }
  assert.equal(applyCoupon(0, { type: 'percent', value: 10 }), 0);
});
