'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('percent: biên', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 33.3 }), 667);
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3); // nửa lên
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.ok(Number.isInteger(applyCoupon(999, { type: 'percent', value: 33.3 })));
});

test('fixed: biên', () => {
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 100 }), 0);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 0 }), 100);
  assert.throws(() => applyCoupon(100, { type: 'fixed', value: 1.5 }), RangeError);
  assert.throws(() => applyCoupon(100, { type: 'fixed', value: -1 }), RangeError);
});

test('coupon sai → RangeError', () => {
  const bad = [null, undefined, { value: 5 }, { type: 'bogus', value: 5 }, { type: 'percent' },
    { type: 'percent', value: '10' }, { type: 'fixed', value: '5' },
    { type: 'percent', value: NaN }, { type: 'fixed', value: NaN },
    { type: 'percent', value: -1 }, { type: 'percent', value: 101 }, 'percent', 5];
  for (const c of bad) assert.throws(() => applyCoupon(100, c), RangeError, JSON.stringify(c));
});

test('toCents: biên', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.005), 1);
  // 1.005 nhị phân là 1.00499999999999989... nên nhân 100 ra < 100.5 → 100
  assert.equal(toCents(1.005), 100);
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
  assert.throws(() => toCents(-Infinity), RangeError);
});

test('total: danh sách rỗng', () => {
  assert.equal(total([]), 0);
});
