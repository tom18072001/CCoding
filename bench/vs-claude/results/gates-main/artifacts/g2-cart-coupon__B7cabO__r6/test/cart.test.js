'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('toCents số đẹp', () => { assert.equal(toCents(10.5), 1050); });
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('toCents nửa xu và dạng mũ', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1e21), 1e23);
});
test('toCents lỗi', () => {
  for (const x of [-1, NaN, Infinity, -Infinity]) assert.throws(() => toCents(x), RangeError);
});
test('applyCoupon biên', () => {
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(0, { type: 'percent', value: 30 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 5 }), 0);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.ok(Number.isInteger(applyCoupon(999, { type: 'percent', value: 33.3 })));
});
test('applyCoupon lỗi biên', () => {
  for (const c of [undefined, 'percent', 5, { value: 5 }, { type: 'fixed' }, { type: 'fixed', value: Infinity },
    { type: 'percent', value: Infinity }, { type: 'percent', value: '10' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
  for (const t of [-1, NaN, Infinity]) assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
});
test('total',() => { assert.equal(total([{ price: 19.99, quantity: 2 }, { price: 1, quantity: 1 }]), 4098); });
test('applyCoupon percent', () => {
  assert.equal(applyCoupon(1000, { type: 'percent', value: 10 }), 900);
  assert.equal(applyCoupon(1005, { type: 'percent', value: 50 }), 503);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 5000 }), 0);
});
test('applyCoupon lỗi', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }, { type: 'percent', value: NaN }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
