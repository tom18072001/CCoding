'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { total, applyCoupon } = require('../src/cart');

test('percent 0/50/100', () => {
  assert.strictEqual(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.strictEqual(applyCoupon(1000, { type: 'percent', value: 50 }), 500);
  assert.strictEqual(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.strictEqual(applyCoupon(5, { type: 'percent', value: 50 }), 3); // 2.5 -> 3
  assert.strictEqual(applyCoupon(1, { type: 'percent', value: 50 }), 1); // 0.5 -> 1
  assert.strictEqual(applyCoupon(999, { type: 'percent', value: 10 }), 899); // 899.1 -> 899
});

test('fixed 0, bằng và lớn hơn tổng', () => {
  assert.strictEqual(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.strictEqual(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.strictEqual(applyCoupon(1000, { type: 'fixed', value: 1000 }), 0);
  assert.strictEqual(applyCoupon(1000, { type: 'fixed', value: 5000 }), 0);
});

test('tổng bằng 0', () => {
  assert.strictEqual(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.strictEqual(applyCoupon(0, { type: 'fixed', value: 100 }), 0);
});

test('coupon sai kiểu → RangeError', () => {
  const bad = [
    null, undefined, 'percent', 'SALE10', 42,
    { type: 'bogus', value: 10 },
    { value: 10 },
    { type: 'percent' },
    { type: 'fixed' },
    { type: 'percent', value: '5' },
    { type: 'fixed', value: '5' },
    { type: 'percent', value: NaN },
    { type: 'percent', value: Infinity },
    { type: 'fixed', value: NaN },
    { type: 'fixed', value: Infinity },
  ];
  for (const c of bad) {
    assert.throws(() => applyCoupon(1000, c), RangeError, JSON.stringify(c));
  }
});

test('percent ngoài [0,100] → RangeError', () => {
  assert.throws(() => applyCoupon(1000, { type: 'percent', value: -1 }), RangeError);
  assert.throws(() => applyCoupon(1000, { type: 'percent', value: 101 }), RangeError);
});

test('fixed âm hoặc không nguyên → RangeError', () => {
  assert.throws(() => applyCoupon(1000, { type: 'fixed', value: -1 }), RangeError);
  assert.throws(() => applyCoupon(1000, { type: 'fixed', value: 1.5 }), RangeError);
});

test('total([]) trả 0', () => {
  assert.strictEqual(total([]), 0);
});

test('total nhiều dòng và quantity', () => {
  assert.strictEqual(total([{ price: 19.99, quantity: 3 }]), 5997);
  assert.strictEqual(
    total([
      { price: 10, quantity: 2 },
      { price: 0.5, quantity: 1 },
      { price: 19.99, quantity: 1 },
    ]),
    2000 + 50 + 1999
  );
  assert.strictEqual(total([{ price: 5, quantity: 0 }]), 0);
});
