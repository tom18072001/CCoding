'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('hidden/toCents 0.29', () => { assert.equal(toCents(0.29), 29); });
test('hidden/toCents 4.35', () => { assert.equal(toCents(4.35), 435); });
test('hidden/toCents âm', () => { assert.throws(() => toCents(-1), RangeError); });
test('hidden/total có số lẻ', () => { assert.equal(total([{ price: 0.29, quantity: 3 }, { price: 4.35, quantity: 1 }]), 522); });
test('hidden/percent', () => { assert.equal(applyCoupon(1999, { type: 'percent', value: 10 }), 1799); });
test('hidden/percent làm tròn nửa lên', () => { assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3); });
test('hidden/percent 100 và 0', () => { assert.equal(applyCoupon(500, { type: 'percent', value: 100 }), 0); assert.equal(applyCoupon(500, { type: 'percent', value: 0 }), 500); });
test('hidden/fixed không âm', () => { assert.equal(applyCoupon(300, { type: 'fixed', value: 500 }), 0); assert.equal(applyCoupon(900, { type: 'fixed', value: 500 }), 400); });
test('hidden/coupon sai', () => {
  for (const c of [null, { type: 'percent', value: 101 }, { type: 'percent', value: -1 }, { type: 'fixed', value: -5 }, { type: 'fixed', value: 1.5 }, { type: 'x', value: 1 }]) assert.throws(() => applyCoupon(100, c), RangeError);
});
