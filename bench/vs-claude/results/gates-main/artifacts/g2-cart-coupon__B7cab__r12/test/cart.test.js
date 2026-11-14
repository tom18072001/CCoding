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
test('applyCoupon sai coupon', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
test('toCents biên', () => {
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(0), 0);
  assert.ok(Object.is(toCents(-0), 0));
  for (const x of [-1, NaN, Infinity, -Infinity]) assert.throws(() => toCents(x), RangeError);
});
test('applyCoupon biên', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(100, { type: 'percent', value: 33.333 }), 67);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1000 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 5 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: -0 }), 1000);
  for (const c of [undefined, [], 'percent', { type: 'percent', value: NaN }, { type: 'percent', value: Infinity },
    { type: 'percent', value: '10' }, { type: 'fixed', value: Infinity }, { type: 'fixed', value: NaN }, { value: 5 }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
