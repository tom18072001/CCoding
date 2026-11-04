'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } =require('../src/cart');
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
test('applyCoupon coupon sai', () => {
  for (const c of [null, undefined, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 },
    { type: 'percent', value: -1 }, { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 },
    { type: 'fixed', value: '5' }, { type: 'percent', value: NaN }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
