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
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1500 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 250 }), 750);
});
test('applyCoupon lỗi', () => {
  for (const c of [null, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }])
    assert.throws(() => applyCoupon(100, c), RangeError);
});

test('applyCoupon biên percent/fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 1000 }), 0);
});
test('applyCoupon lỗi mở rộng', () => {
  const bad = [undefined, [], 'x', 5, {}, { type: 'percent', value: -1 }, { type: 'percent', value: '10' },
    { type: 'percent', value: NaN }, { type: 'fixed', value: NaN }, { type: 'fixed', value: '5' }, { type: 'fixed', value: Infinity }];
  for (const c of bad) assert.throws(() => applyCoupon(100, c), RangeError);
});
test('toCents biên', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(1.005), 100);
  for (const x of [-1, NaN, Infinity, -Infinity]) assert.throws(() => toCents(x), RangeError);
});
