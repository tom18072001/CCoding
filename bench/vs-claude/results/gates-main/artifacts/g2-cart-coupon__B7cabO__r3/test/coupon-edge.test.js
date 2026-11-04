'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fixed = (value) => ({ type: 'fixed', value });

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1000, pct(0)), 1000);
  assert.equal(applyCoupon(1000, pct(100)), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(1, pct(50)), 1);
});

test('percent không nguyên', () => {
  assert.equal(applyCoupon(1000, pct(12.5)), 875);
  assert.equal(applyCoupon(999, pct(33.3)), 666);
});

test('fixed lớn hơn total, bằng 0, total 0', () => {
  assert.equal(applyCoupon(100, fixed(300)), 0);
  assert.equal(applyCoupon(100, fixed(100)), 0);
  assert.equal(applyCoupon(100, fixed(0)), 100);
  assert.equal(applyCoupon(0, fixed(0)), 0);
  assert.equal(applyCoupon(0, fixed(50)), 0);
  assert.equal(applyCoupon(0, pct(50)), 0);
});

test('kết quả luôn là số nguyên', () => {
  assert.ok(Number.isInteger(applyCoupon(777, pct(33.33))));
});

test('percent ngoài [0,100]', () => {
  for (const v of [-1, 100.01, NaN, Infinity, -Infinity]) {
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError, 'percent ' + v);
  }
});

test('fixed âm hoặc không nguyên', () => {
  for (const v of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => applyCoupon(1000, fixed(v)), RangeError, 'fixed ' + v);
  }
});

test('coupon sai kiểu', () => {
  for (const c of [null, undefined, 'percent', '10%', 10]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('type lạ, thiếu type, value là chuỗi', () => {
  assert.throws(() => applyCoupon(1000, { type: 'bogo', value: 1 }), RangeError);
  assert.throws(() => applyCoupon(1000, { value: 10 }), RangeError);
  assert.throws(() => applyCoupon(1000, pct('10')), RangeError);
  assert.throws(() => applyCoupon(1000, fixed('100')), RangeError);
});

test('totalCents âm hoặc không nguyên (hành vi ngoài SPEC: hiện ném RangeError)', () => {
  assert.throws(() => applyCoupon(-1, fixed(0)), RangeError);
  assert.throws(() => applyCoupon(10.5, pct(10)), RangeError);
});

test('toCents làm tròn gần nhất', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(0), 0);
});

test('toCents số âm hoặc không hữu hạn', () => {
  for (const x of [-1, NaN, Infinity]) {
    assert.throws(() => toCents(x), RangeError);
  }
});
