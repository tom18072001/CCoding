'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');

const pct = (v) => ({ type: 'percent', value: v });
const fix = (v) => ({ type: 'fixed', value: v });

test('percent 0 giữ nguyên, 100 về 0', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
});

test('percent 33.5 trên 1000 → 665', () => {
  assert.equal(applyCoupon(1000, pct(33.5)), 665);
});

test('percent tổng lẻ làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3); // 2.5 → 3
  assert.equal(applyCoupon(1, pct(50)), 1); // 0.5 → 1
  assert.equal(applyCoupon(3, pct(33.5)), 2); // 1.995 → 2
});

test('fixed 0, bằng tổng, lớn hơn tổng', () => {
  assert.equal(applyCoupon(500, fix(0)), 500);
  assert.equal(applyCoupon(500, fix(500)), 0);
  assert.equal(applyCoupon(500, fix(501)), 0);
  assert.equal(applyCoupon(500, fix(100)), 400);
});

test('tổng bằng 0', () => {
  assert.equal(applyCoupon(0, pct(50)), 0);
  assert.equal(applyCoupon(0, fix(0)), 0);
  assert.equal(applyCoupon(0, fix(10)), 0);
});

test('coupon sai kiểu → RangeError', () => {
  for (const c of [null, [], 'percent', 'SALE10']) {
    assert.throws(() => applyCoupon(1000, c), RangeError, String(c));
  }
});

test('type thiếu hoặc lạ → RangeError', () => {
  assert.throws(() => applyCoupon(1000, { value: 10 }), RangeError);
  assert.throws(() => applyCoupon(1000, { type: 'bogo', value: 10 }), RangeError);
});

test('value NaN, Infinity, chuỗi → RangeError', () => {
  for (const type of ['percent', 'fixed']) {
    for (const value of [NaN, Infinity, -Infinity, '10']) {
      assert.throws(() => applyCoupon(1000, { type, value }), RangeError, `${type} ${value}`);
    }
  }
});

test('percent ngoài [0,100] → RangeError', () => {
  assert.throws(() => applyCoupon(1000, pct(100.0001)), RangeError);
  assert.throws(() => applyCoupon(1000, pct(-0.0001)), RangeError);
});

test('fixed không nguyên hoặc âm → RangeError', () => {
  assert.throws(() => applyCoupon(1000, fix(1.5)), RangeError);
  assert.throws(() => applyCoupon(1000, fix(-1)), RangeError);
});

test('kết quả luôn là số nguyên', () => {
  for (const t of [0, 1, 7, 99, 1001, 99999]) {
    for (const v of [0, 0.1, 12.5, 33.3, 33.5, 66.67, 99.99, 100]) {
      assert.ok(Number.isInteger(applyCoupon(t, pct(v))), `${t} ${v}`);
    }
    for (const v of [0, 1, t, t + 1]) {
      assert.ok(Number.isInteger(applyCoupon(t, fix(v))), `${t} fixed ${v}`);
    }
  }
});

// Ghi chú: SPEC không nói về totalCents không hợp lệ (âm, lẻ, NaN); cài đặt hiện ném
// RangeError nhưng không khẳng định ở đây.
