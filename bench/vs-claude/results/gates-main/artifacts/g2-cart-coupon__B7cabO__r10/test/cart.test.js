'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('toCents số đẹp', () => { assert.equal(toCents(10.5), 1050); });
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('total', () => { assert.equal(total([{ price: 19.99, quantity: 2 }, { price: 1, quantity: 1 }]), 4098); });

test('applyCoupon percent', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 10 }), 900);
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
});
test('applyCoupon lỗi', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('applyCoupon percent biên và làm tròn nửa lên', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
  assert.equal(applyCoupon(10, { type: 'percent', value: 5 }), 10); // 9.5 -> 10
  assert.equal(applyCoupon(1, { type: 'percent', value: 12.5 }), 1); // 0.875 -> 1
  assert.equal(applyCoupon(999, { type: 'percent', value: 33.3 }), 666);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
});
test('applyCoupon fixed biên', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1001 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 333 }), 667);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 5 }), 0);
});
test('applyCoupon coupon sai kiểu và total không hợp lệ', () => {
  for (const c of [undefined, 'percent', 5, { type: 'percent' }, { type: 'percent', value: NaN },
    { type: 'fixed', value: Infinity }, { type: 'percent', value: '10' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
  for (const t of [-1, NaN, Infinity, 10.5, '100', undefined]) {
    assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
  }
});
test('toCents lỗi', () => {
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
});
