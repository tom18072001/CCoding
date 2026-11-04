'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');

const pct = (v) => ({ type: 'percent', value: v });
const fix = (v) => ({ type: 'fixed', value: v });

test('totalCents không hợp lệ → RangeError', () => {
  for (const t of [-1, 1.5, NaN, Infinity, '100', null, undefined]) {
    assert.throws(() => applyCoupon(t, pct(10)), RangeError);
  }
});

test('coupon không hợp lệ → RangeError', () => {
  for (const c of [null, undefined, [], 'x', 5, {}, { type: 'percent' }, { value: 5 },
    { type: 'fixed' }, { type: 'zzz', value: 5 }, { type: 'percent', value: NaN }, { type: 'fixed', value: Infinity }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('percent biên', () => {
  assert.equal(applyCoupon(1000, pct(0)), 1000);
  assert.equal(applyCoupon(1000, pct(100)), 0);
  assert.equal(applyCoupon(5, pct(50)), 3);
  for (const v of [100.5, -1, NaN]) assert.throws(() => applyCoupon(1000, pct(v)), RangeError);
});

test('fixed biên', () => {
  assert.equal(applyCoupon(1000, fix(0)), 1000);
  assert.equal(applyCoupon(100, fix(300)), 0);
  assert.equal(applyCoupon(300, fix(300)), 0);
  for (const v of [1.5, -1, NaN]) assert.throws(() => applyCoupon(1000, fix(v)), RangeError);
});

test('kết quả luôn nguyên và không là -0', () => {
  const cases = [[0, pct(0)], [0, pct(100)], [0, pct(33.3)], [0, fix(0)], [0, fix(5)], [-0, pct(10)], [-0, fix(0)],
    [1000, pct(100)], [100, fix(100)], [7, pct(33.3)]];
  for (const [t, c] of cases) {
    const r = applyCoupon(t, c);
    assert.ok(Number.isInteger(r));
    assert.ok(!Object.is(r, -0), `-0 với ${t} ${JSON.stringify(c)}`);
  }
});

test('total biên', () => {
  assert.ok(Object.is(total([]), 0));
  assert.equal(total([{ price: 0, quantity: 5 }]), 0);
  assert.equal(total([{ price: 2, quantity: 0 }]), 0);
  for (const bad of [null, undefined, {}, 'abc']) assert.throws(() => total(bad), RangeError);
  for (const q of [-1, 1.5, NaN, '2', undefined]) assert.throws(() => total([{ price: 1, quantity: q }]), RangeError);
  assert.throws(() => total([null]), RangeError);
  assert.throws(() => total([{ price: -1, quantity: 1 }]), RangeError);
});
