'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { total, applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

test('toCents biên', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(0.01), 1);
  assert.equal(toCents(19.99), 1999);
});
test('toCents không hợp lệ → RangeError', () => {
  for (const x of [-1, NaN, Infinity, -Infinity]) assert.throws(() => toCents(x), RangeError);
});
test('total rỗng', () => { assert.equal(total([]), 0); });
test('percent 0 và 100', () => {
  assert.equal(applyCoupon(1234, { type: 'percent', value: 0 }), 1234);
  assert.equal(applyCoupon(1234, { type: 'percent', value: 100 }), 0);
});
test('làm tròn nửa lên', () => {
  assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3);
  assert.equal(applyCoupon(1, { type: 'percent', value: 50 }), 1);
});
test('fixed biên', () => {
  assert.equal(applyCoupon(500, { type: 'fixed', value: 500 }), 0);
  assert.equal(applyCoupon(500, { type: 'fixed', value: 501 }), 0);
  assert.equal(applyCoupon(500, { type: 'fixed', value: 0 }), 500);
});
test('kết quả luôn là số nguyên', () => {
  for (const t of [0, 1, 7, 333, 9999]) {
    for (const v of [0, 1, 33, 33.3, 50, 99, 100]) {
      assert.ok(Number.isInteger(applyCoupon(t, { type: 'percent', value: v })));
    }
    assert.ok(Number.isInteger(applyCoupon(t, { type: 'fixed', value: 10 })));
  }
});
test('coupon sai → RangeError', () => {
  const bad = [null, undefined, 'percent', { value: 10 }, { type: 'weird', value: 1 },
    { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }];
  for (const c of bad) assert.throws(() => applyCoupon(1000, c), RangeError);
});
