'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('toCents số đẹp', () => { assert.equal(toCents(10.5), 1050); });
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('applyCoupon percent', () => { assert.equal(applyCoupon(1001, { type: 'percent', value: 50 }), 501); });
test('applyCoupon fixed', () => { assert.equal(applyCoupon(500, { type: 'fixed', value: 900 }), 0); });
test('applyCoupon sai', () => {
  assert.throws(() => applyCoupon(100, { type: 'percent', value: 101 }), RangeError);
  assert.throws(() => applyCoupon(100, { type: 'fixed', value: 1.5 }), RangeError);
  assert.throws(() => applyCoupon(100, null), RangeError);
});
test('total',() => { assert.equal(total([{ price: 19.99, quantity: 2 }, { price: 1, quantity: 1 }]), 4098); });

test('toCents nửa xu số thực', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(1.255), 126);
  assert.equal(toCents(0), 0);
});
test('toCents sai', () => {
  for (const v of [-1, NaN, Infinity]) assert.throws(() => toCents(v), RangeError);
});
test('applyCoupon biên hợp lệ', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
  assert.equal(applyCoupon(1001, { type: 'percent', value: 33.3 }), 668);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 100 }), 0);
  assert.equal(applyCoupon(500, { type: 'fixed', value: 0 }), 500);
  assert.equal(applyCoupon(500, { type: 'fixed', value: 500 }), 0);
  assert.ok(Number.isInteger(applyCoupon(999, { type: 'percent', value: 33.3 })));
});
test('applyCoupon ca lỗi biên', () => {
  for (const c of [null, undefined, 'percent', 5, []]) assert.throws(() => applyCoupon(100, c), RangeError);
  for (const c of [{ type: 'weird', value: 1 }, { value: 1 }, { type: 'percent', value: NaN },
    { type: 'percent', value: Infinity }, { type: 'percent', value: '10' }, { type: 'percent', value: -1 },
    { type: 'fixed', value: '10' }, { type: 'fixed', value: -1 }, { type: 'fixed', value: Infinity }, { type: 'fixed' }])
    assert.throws(() => applyCoupon(100, c), RangeError);
  for (const t of [-1, 1.5, NaN, '100']) assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
});
