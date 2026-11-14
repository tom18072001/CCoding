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
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
});
test('applyCoupon sai', () => {
  for (const c of [null, {}, { type: 'percent', value: 101 }, { type: 'percent', value: -1 }, { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'x', value: 1 }])
    assert.throws(() => applyCoupon(100, c), RangeError);
});

test('applyCoupon biên percent/fixed', () => {
  const p = (t, v) => applyCoupon(t, { type: 'percent', value: v });
  const f = (t, v) => applyCoupon(t, { type: 'fixed', value: v });
  assert.equal(p(1000, 0), 1000);
  assert.equal(p(1000, 100), 0);
  assert.equal(p(0, 50), 0);
  assert.equal(p(1, 50), 1);
  assert.equal(p(3, 50), 2);
  assert.equal(f(0, 0), 0);
  assert.equal(f(500, 0), 500);
  assert.equal(f(100, 300), 0);
  assert.equal(f(300, 300), 0);
  for (const [t, v] of [[999, 33.3], [1, 0.5], [12345, 7.77]]) assert.ok(Number.isInteger(p(t, v)));
});
test('applyCoupon RangeError biên', () => {
  const bad = [undefined, null, 'x', 5, { type: 'percent', value: '10' }, { type: 'percent', value: NaN },
    { type: 'percent', value: Infinity }, { type: 'percent', value: -1 }, { type: 'percent', value: 100.01 },
    { type: 'fixed', value: 1.5 }, { type: 'fixed', value: -1 }, { type: 'fixed', value: '5' }, { type: 'zzz', value: 1 }];
  for (const c of bad) assert.throws(() => applyCoupon(100, c), RangeError);
  for (const t of [-1, 1.5, NaN, Infinity, '100', undefined])
    assert.throws(() => applyCoupon(t, { type: 'fixed', value: 1 }), RangeError);
});
