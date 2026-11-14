'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (v) => ({ type: 'percent', value: v });
const fix = (v) => ({ type: 'fixed', value: v });

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
  assert.equal(applyCoupon(0, pct(50)), 0);
});

test('percent có phần lẻ, làm tròn nửa lên', () => {
  assert.equal(applyCoupon(1, pct(50)), 1);
  assert.equal(applyCoupon(3, pct(50)), 2);
  assert.equal(applyCoupon(999, pct(33.33)), 666);
  assert.equal(applyCoupon(1000, pct(12.5)), 875);
  assert.equal(applyCoupon(1, pct(0.01)), 1);
  assert.equal(applyCoupon(1, pct(99.99)), 0);
});

test('percent không hợp lệ ném RangeError', () => {
  for (const v of [-1, 100.01, NaN, Infinity, -Infinity, '10', null, undefined])
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError, 'value=' + String(v));
  assert.throws(() => applyCoupon(1000, { type: 'percent' }), RangeError);
});

test('fixed hợp lệ', () => {
  assert.equal(applyCoupon(1000, fix(0)), 1000);
  assert.equal(applyCoupon(1000, fix(1000)), 0);
  assert.equal(applyCoupon(100, fix(300)), 0);
  assert.equal(applyCoupon(0, fix(5)), 0);
});

test('fixed không hợp lệ ném RangeError', () => {
  for (const v of [1.5, -1, '5', NaN, Infinity, null, undefined])
    assert.throws(() => applyCoupon(1000, fix(v)), RangeError, 'value=' + String(v));
  assert.throws(() => applyCoupon(1000, { type: 'fixed' }), RangeError);
});

test('coupon sai kiểu', () => {
  for (const c of [null, undefined, 5, 'percent', {}, { value: 10 }, { type: 'x', value: 1 }, { type: 'PERCENT', value: 10 }])
    assert.throws(() => applyCoupon(1000, c), RangeError);
});

test('totalCents không hợp lệ (hành vi hiện tại: RangeError)', () => {
  for (const t of [-1, 1.5, NaN, Infinity, '100', null, undefined])
    assert.throws(() => applyCoupon(t, pct(10)), RangeError, 'total=' + String(t));
  assert.equal(applyCoupon(0, fix(0)), 0);
});

test('mọi kết quả hợp lệ là số nguyên không âm', () => {
  for (const t of [0, 1, 7, 99, 1001, 123457]) {
    for (const v of [0, 0.5, 1, 10, 33.33, 66.67, 99.99, 100]) {
      const r = applyCoupon(t, pct(v));
      assert.ok(Number.isInteger(r) && r >= 0 && r <= t, `t=${t} v=${v} r=${r}`);
    }
    for (const c of [0, 1, 50, 100000]) {
      const r = applyCoupon(t, fix(c));
      assert.ok(Number.isInteger(r) && r >= 0 && r <= t, `t=${t} c=${c} r=${r}`);
    }
  }
});

test('toCents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(1.006), 101);
  assert.ok(Number.isInteger(toCents(0.1 + 0.2)));
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
});

test('total với giỏ rỗng và giỏ thường', () => {
  assert.equal(total([]), 0);
  assert.equal(total([{ price: 0, quantity: 3 }]), 0);
  assert.equal(total([{ price: 0.1, quantity: 3 }]), 30);
  assert.equal(applyCoupon(total([]), pct(50)), 0);
});
