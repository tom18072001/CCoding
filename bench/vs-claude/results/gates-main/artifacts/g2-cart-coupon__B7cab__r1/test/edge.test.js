'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1234, { type: 'percent', value: 0 }), 1234);
  assert.equal(applyCoupon(1234, { type: 'percent', value: 100 }), 0);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
  assert.equal(applyCoupon(3, { type: 'percent', value: 50 }), 2);
});

test('fixed biên', () => {
  assert.equal(applyCoupon(100, { type: 'fixed', value: 500 }), 0);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 100 }), 0);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 0 }), 100);
});

test('fixed không nguyên hoặc âm → RangeError', () => {
  for (const v of [0.5, 1.5, -1, -0.5]) {
    assert.throws(() => applyCoupon(1000, { type: 'fixed', value: v }), RangeError);
  }
});

test('percent ngoài [0,100] → RangeError', () => {
  for (const v of [-1, 100.01, -0.01, 101]) {
    assert.throws(() => applyCoupon(1000, { type: 'percent', value: v }), RangeError);
  }
});

test('coupon sai kiểu → RangeError', () => {
  const bad = [null, undefined, 'percent', 5, {}, { value: 10 }, { type: 'percent' },
    { type: 'percent', value: '10' }, { type: 'fixed', value: '5' },
    { type: 'percent', value: NaN }, { type: 'percent', value: Infinity },
    { type: 'fixed', value: NaN }, { type: 'fixed', value: Infinity }, { type: 'bogus', value: 1 }];
  for (const c of bad) assert.throws(() => applyCoupon(1000, c), RangeError);
});

test('totalCents sai → RangeError', () => {
  for (const t of [-1, 1.5, NaN, Infinity, '100', undefined, null]) {
    assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
  }
});

test('total rỗng', () => { assert.equal(total([]), 0); });

test('toCents biên', () => {
  assert.equal(toCents(0), 0);
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
  assert.throws(() => toCents(-Infinity), RangeError);
});

test('toCents sai số float thường gặp', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(0.57), 57);
  assert.equal(toCents(1.1), 110);
});
