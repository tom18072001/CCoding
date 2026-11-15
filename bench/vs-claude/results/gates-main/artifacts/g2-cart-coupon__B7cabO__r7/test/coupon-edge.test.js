'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent 0 và 100', () => {
  assert.equal(applyCoupon(999, pct(0)), 999);
  assert.equal(applyCoupon(999, pct(100)), 0);
});
test('percent lẻ 33.3 và 12.5', () => {
  assert.equal(applyCoupon(1000, pct(33.3)), 667);
  assert.equal(applyCoupon(1000, pct(12.5)), 875);
  assert.equal(applyCoupon(1, pct(33.3)), 1);
  assert.equal(applyCoupon(5, pct(12.5)), 4);
});
test('làm tròn nửa lên với 1 xu và 5 xu', () => {
  assert.equal(applyCoupon(1, pct(50)), 1);
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(5, pct(10)), 5);
});
test('percent ngoài [0,100] ném RangeError', () => {
  assert.throws(() => applyCoupon(100, pct(-0.1)), RangeError);
  assert.throws(() => applyCoupon(100, pct(100.1)), RangeError);
});
test('fixed 0, bằng total, lớn hơn total', () => {
  assert.equal(applyCoupon(500, fix(0)), 500);
  assert.equal(applyCoupon(500, fix(500)), 0);
  assert.equal(applyCoupon(500, fix(501)), 0);
});
test('fixed -1 và 1.5 ném RangeError', () => {
  assert.throws(() => applyCoupon(500, fix(-1)), RangeError);
  assert.throws(() => applyCoupon(500, fix(1.5)), RangeError);
});
test('coupon sai kiểu / sai giá trị ném RangeError', () => {
  const bad = [null, undefined, 'percent', [], { type: 'bogus', value: 10 },
    { type: 'percent', value: '10' }, { type: 'fixed', value: '10' },
    pct(NaN), fix(NaN), pct(Infinity), fix(Infinity),
    { type: 'percent' }, { type: 'fixed' }];
  for (const c of bad) assert.throws(() => applyCoupon(100, c), RangeError, JSON.stringify(c));
});
test('totalCents = 0', () => {
  assert.equal(applyCoupon(0, pct(50)), 0);
  assert.equal(applyCoupon(0, fix(100)), 0);
  assert.equal(applyCoupon(0, fix(0)), 0);
});
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('toCents -1 và NaN ném RangeError', () => {
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
});
test('toCents 0.005 làm tròn gần nhất (SPEC) thành 1, không ném', () => {
  assert.equal(toCents(0.005), 1);
});
