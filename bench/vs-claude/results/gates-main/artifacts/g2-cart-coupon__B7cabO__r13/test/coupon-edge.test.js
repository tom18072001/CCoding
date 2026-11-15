'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent 0 giữ nguyên, 100 ra 0', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(1, pct(50)), 1);
});

test('percent luôn ra số nguyên', () => {
  for (const [t, v] of [[999, 33], [1, 33.3], [12345, 7.77], [7, 10]]) {
    assert.ok(Number.isInteger(applyCoupon(t, pct(v))), `${t}/${v}`);
  }
});

test('fixed: c=0, c lớn hơn total ra 0', () => {
  assert.equal(applyCoupon(500, fix(0)), 500);
  assert.equal(applyCoupon(500, fix(200)), 300);
  assert.equal(applyCoupon(100, fix(150)), 0);
});

test('fixed không nguyên hoặc âm ném RangeError', () => {
  assert.throws(() => applyCoupon(100, fix(1.5)), RangeError);
  assert.throws(() => applyCoupon(100, fix(-1)), RangeError);
});

test('coupon sai ném RangeError', () => {
  const bad = [
    null, undefined, 'x', 10,
    { type: 'bogus', value: 1 },
    { type: 'percent', value: NaN },
    { type: 'percent', value: Infinity },
    { type: 'percent', value: '10' },
    { type: 'fixed', value: NaN },
    { type: 'fixed', value: Infinity },
    { type: 'fixed', value: '10' },
    pct(-1), pct(100.01),
  ];
  for (const c of bad) assert.throws(() => applyCoupon(100, c), RangeError, String(JSON.stringify(c)));
});

test('toCents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  for (const x of [-1, NaN, Infinity]) assert.throws(() => toCents(x), RangeError);
});

test('total([]) ra 0', () => { assert.equal(total([]), 0); });
