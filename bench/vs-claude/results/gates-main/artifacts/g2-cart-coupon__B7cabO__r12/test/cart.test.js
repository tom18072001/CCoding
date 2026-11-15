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
  assert.equal(applyCoupon(1005, { type: 'percent', value: 50 }), 503);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
});
test('applyCoupon lỗi', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'percent', value: '5' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

test('applyCoupon ca biên', () => {
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1, { type: 'percent', value: 12.5 }), 1);
  assert.equal(applyCoupon(4, { type: 'percent', value: 12.5 }), 4);
  assert.equal(applyCoupon(1, { type: 'percent', value: 0.5 }), 1);
  assert.equal(applyCoupon(0, { type: 'percent', value: 30 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 0 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1000 }), 0);
});
test('applyCoupon lỗi mở rộng', () => {
  for (const c of [undefined, 'percent', 5, { value: 5 }, { type: 'percent' }, { type: 'percent', value: NaN },
    { type: 'percent', value: Infinity }, { type: 'fixed', value: Infinity }, { type: 'fixed', value: '5' },
    { type: 'fixed', value: NaN }, { type: 'fixed' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
  for (const t of [-1, 1.5, NaN, Infinity, '100', null, undefined]) {
    assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
  }
});
