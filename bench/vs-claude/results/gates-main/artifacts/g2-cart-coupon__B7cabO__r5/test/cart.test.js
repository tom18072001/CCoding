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
  assert.equal(applyCoupon(1000, { type: 'percent', value: 0 }), 1000);
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 5000 }), 0);
});
test('applyCoupon sai đầu vào', () => {
  for (const c of [null, undefined, 'x', {}, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'bogus', value: 1 }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
test('toCents .xx5 làm tròn nửa lên', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(0.145), 15);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(0), 0);
  assert.throws(() => toCents(-1), RangeError);
  assert.throws(() => toCents(NaN), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
});
test('applyCoupon làm tròn nửa lên', () => {
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3);
});
test('applyCoupon fixed 0 và total 0', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000);
  assert.equal(applyCoupon(0, { type: 'fixed', value: 0 }), 0);
  assert.equal(applyCoupon(0, { type: 'percent', value: 50 }), 0);
});
test('applyCoupon kết quả luôn là số nguyên', () => {
  for (const t of [1, 3, 7, 99, 1001]) for (const v of [0, 0.5, 33, 33.33, 99.99, 100]) {
    assert.ok(Number.isInteger(applyCoupon(t, { type: 'percent', value: v })));
  }
});
test('applyCoupon value NaN, Infinity, 100.01, sai kiểu', () => {
  for (const c of [{ type: 'percent', value: 100.01 }, { type: 'percent', value: NaN }, { type: 'percent', value: Infinity },
    { type: 'fixed', value: NaN }, { type: 'fixed', value: Infinity }, { type: 'fixed', value: '5' }, 5]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});
