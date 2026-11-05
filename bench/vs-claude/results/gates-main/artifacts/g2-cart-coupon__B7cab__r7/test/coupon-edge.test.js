'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('percent 0 giữ nguyên tổng', () => {
  assert.equal(applyCoupon(1999, { type: 'percent', value: 0 }), 1999);
});

test('percent 100 cho 0', () => {
  assert.equal(applyCoupon(1999, { type: 'percent', value: 100 }), 0);
});

test('làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3);
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
});

test('fixed bằng đúng tổng cho 0, vượt tổng không âm', () => {
  assert.equal(applyCoupon(500, { type: 'fixed', value: 500 }), 0);
  assert.equal(applyCoupon(500, { type: 'fixed', value: 900 }), 0);
});

test('fixed 0 giữ nguyên tổng', () => {
  assert.equal(applyCoupon(500, { type: 'fixed', value: 0 }), 500);
});

test('tổng 0 với mọi loại coupon', () => {
  assert.equal(applyCoupon(0, { type: 'percent', value: 30 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 100 }), 0);
});

test('Infinity / NaN ở value ném RangeError', () => {
  for (const type of ['percent', 'fixed']) {
    for (const value of [Infinity, -Infinity, NaN]) {
      assert.throws(() => applyCoupon(100, { type, value }), RangeError);
    }
  }
});

test('coupon là chuỗi, số, mảng, null ném RangeError', () => {
  for (const c of ['percent', 10, [10], [], null, undefined]) {
    assert.throws(() => applyCoupon(100, c), RangeError);
  }
});

test('kết quả luôn là số nguyên', () => {
  for (let t = 0; t <= 200; t += 7) {
    for (let v = 0; v <= 100; v += 3) {
      const r = applyCoupon(t, { type: 'percent', value: v });
      assert.ok(Number.isInteger(r) && r >= 0 && r <= t);
    }
  }
  assert.ok(Number.isInteger(applyCoupon(333, { type: 'percent', value: 33.3 })));
});

test('toCents làm tròn gần nhất', () => {
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(19.99), 1999);
});

test('toCents âm hoặc NaN ném RangeError', () => {
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
});
