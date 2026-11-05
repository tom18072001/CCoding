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
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 5000 }), 0);
});
test('applyCoupon lỗi', () => {
  for (const c of [null, {}, { type: 'percent', value: 101 }, { type: 'percent', value: -1 }, { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'x', value: 1 }])
    assert.throws(() => applyCoupon(100, c), RangeError);
});
test('toCents biên', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(1.005), 101);
  for (const x of [-1, NaN, Infinity, -Infinity]) assert.throws(() => toCents(x), RangeError);
});
test('total rỗng', () => { assert.equal(total([]), 0); });
test('applyCoupon percent lẻ, nửa lên', () => {
  assert.equal(applyCoupon(500, { type: 'percent', value: 33.3 }), 334);
  assert.equal(applyCoupon(1, { type: 'percent', value: 12.5 }), 1);
  assert.equal(applyCoupon(3, { type: 'percent', value: 12.5 }), 3);
  assert.equal(applyCoupon(500, { type: 'percent', value: 99.9 }), 1);
  assert.equal(applyCoupon(1500, { type: 'percent', value: 99.9 }), 2);
  assert.equal(applyCoupon(5, { type: 'percent', value: 0 }), 5);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
});
test('applyCoupon fixed biên', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1000 }), 0);
});
test('applyCoupon coupon sai kiểu/giá trị', () => {
  for (const c of [undefined, [], 'percent', 5, { type: 'percent', value: '10' }, { type: 'percent', value: NaN }, { type: 'percent', value: Infinity }, { type: 'fixed', value: '5' }, { type: 'fixed', value: NaN }, { type: 'fixed', value: Infinity }, { type: 'percent' }])
    assert.throws(() => applyCoupon(100, c), RangeError);
});
test('applyCoupon totalCents sai', () => {
  for (const n of [-1, 1.5, NaN, Infinity, '100', undefined])
    assert.throws(() => applyCoupon(n, { type: 'fixed', value: 1 }), RangeError);
});
