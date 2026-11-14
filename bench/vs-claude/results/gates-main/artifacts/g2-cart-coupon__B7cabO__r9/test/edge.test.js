'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent biên 0 và 100', () => {
  assert.equal(applyCoupon(1000, pct(0)), 1000);
  assert.equal(applyCoupon(1000, pct(100)), 0);
});

test('percent lẻ 33.3', () => {
  assert.equal(applyCoupon(1000, pct(33.3)), 667);
});

test('percent làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, pct(50)), 3);
  assert.equal(applyCoupon(1, pct(50)), 1);
  assert.equal(applyCoupon(0, pct(50)), 0);
  assert.equal(applyCoupon(0, pct(0)), 0);
});

test('fixed biên', () => {
  assert.equal(applyCoupon(1000, fix(0)), 1000);
  assert.equal(applyCoupon(1000, fix(1000)), 0);
  assert.equal(applyCoupon(1000, fix(1001)), 0);
  assert.equal(applyCoupon(1000, fix(400)), 600);
});

test('coupon sai ném RangeError', () => {
  const bad = [
    NaN, Infinity, null, undefined, 'percent', [], [pct(10)],
    { type: 'weird', value: 5 },
    pct(-0.1), pct(100.1), pct(NaN), pct(Infinity),
    fix(-1), fix(1.5), fix(NaN), fix(Infinity),
    { type: 'percent', value: '10' },
    { type: 'fixed', value: '5' },
    { type: 'percent' },
    { type: 'fixed' },
  ];
  for (const c of bad) {
    assert.throws(() => applyCoupon(1000, c), RangeError, 'coupon: ' + JSON.stringify(c));
  }
});

test('toCents hợp lệ', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.29), 29);
});

test('toCents(1.005) ghi nhận kết quả thực tế (do 1.005*100 = 100.49999999999999)', () => {
  assert.equal(toCents(1.005), 100);
});

test('toCents đầu vào sai ném RangeError', () => {
  for (const x of [-1, -0.01, NaN, Infinity, -Infinity]) {
    assert.throws(() => toCents(x), RangeError);
  }
});

test('total rỗng và quantity > 1', () => {
  assert.equal(total([]), 0);
  assert.equal(total([{ price: 19.99, quantity: 3 }]), 5997);
  assert.equal(total([{ price: 0.29, quantity: 2 }, { price: 10.5, quantity: 1 }]), 1108);
});
