'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } =require('../src/cart');
const { toCents } = require('../src/money');

test('toCents số đẹp', () => { assert.equal(toCents(10.5), 1050); });
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('total', () => { assert.equal(total([{ price: 19.99, quantity: 2 }, { price: 1, quantity: 1 }]), 4098); });
test('applyCoupon percent', () => {
  assert.equal(applyCoupon(1001, { type: 'percent', value: 50 }), 501);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 5000 }), 0);
});
test('applyCoupon làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3);
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 10 }), 0);
});
test('applyCoupon totalCents sai', () => {
  for (const t of [10.5, -1, NaN, Infinity, '100', null, undefined]) {
    assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
    assert.throws(() => applyCoupon(t, { type: 'percent', value: 10 }), RangeError);
  }
});
test('toCents ca biên (làm tròn nửa lên trên giá trị đã chuẩn hóa 15 chữ số)', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents(-0.01), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
});
test('applyCoupon coupon sai', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
