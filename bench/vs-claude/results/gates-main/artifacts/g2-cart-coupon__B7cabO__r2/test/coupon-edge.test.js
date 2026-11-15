'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fixed = (value) => ({ type: 'fixed', value });

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(1, pct(50)), 1);
});

test('fixed lớn hơn total → 0, fixed = 0, total = 0', () => {
  assert.equal(applyCoupon(100, fixed(101)), 0);
  assert.equal(applyCoupon(100, fixed(100)), 0);
  assert.equal(applyCoupon(100, fixed(0)), 100);
  assert.equal(applyCoupon(0, fixed(0)), 0);
  assert.equal(applyCoupon(0, fixed(50)), 0);
  assert.equal(applyCoupon(0, pct(50)), 0);
});

test('coupon sai kiểu → RangeError', () => {
  for (const c of [null, undefined, 'percent', '', [], [pct(10)], 5, true, {}, { type: 'x', value: 1 },
    { type: 'percent' }, { value: 10 }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('percent không hợp lệ → RangeError', () => {
  for (const v of [-1, 100.01, NaN, Infinity, -Infinity]) {
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError);
  }
});

test('fixed không hợp lệ → RangeError', () => {
  for (const v of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => applyCoupon(1000, fixed(v)), RangeError);
  }
});

test('value kiểu chuỗi → RangeError', () => {
  assert.throws(() => applyCoupon(1000, pct('10')), RangeError);
  assert.throws(() => applyCoupon(1000, fixed('100')), RangeError);
});

test('kết quả luôn là số nguyên', () => {
  for (const t of [0, 1, 3, 7, 99, 1001, 99999]) {
    for (const v of [0, 0.5, 33.33, 33.333, 50, 66.67, 99.99, 100]) {
      const r = applyCoupon(t, pct(v));
      assert.ok(Number.isInteger(r), `percent ${v} trên ${t} → ${r}`);
      assert.ok(r >= 0 && r <= t);
    }
    assert.ok(Number.isInteger(applyCoupon(t, fixed(2))));
  }
});

test('toCents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  // Ghi nhận hành vi thực tế (double): 0.005*100 = 0.5 → 1; 1.005*100 = 100.49999… → 100
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1.005), 100);
  for (const x of [-0.01, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => toCents(x), RangeError);
  }
});
