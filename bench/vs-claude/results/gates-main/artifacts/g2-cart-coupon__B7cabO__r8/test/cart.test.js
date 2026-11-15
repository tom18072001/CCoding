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
  assert.equal(applyCoupon(1000, { type: 'percent', value: 100 }), 0);
});
test('applyCoupon fixed', () => {
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 300 }), 700);
  assert.equal(applyCoupon(100, { type: 'fixed', value: 300 }), 0);
});
test('applyCoupon coupon sai', () => {
  for (const c of [null, {}, { type: 'x', value: 1 }, { type: 'percent', value: 101 }, { type: 'percent', value: -1 },
    { type: 'fixed', value: -1 }, { type: 'fixed', value: 1.5 }, { type: 'fixed', value: '5' }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError);
  }
});

// --- Test biên (S1) ---
const bad = (total, c) => assert.throws(() => applyCoupon(total, c), RangeError);

test('toCents 0', () => { assert.equal(toCents(0), 0); });
test('toCents số âm ném RangeError', () => { assert.throws(() => toCents(-1), RangeError); });
test('toCents NaN ném RangeError', () => { assert.throws(() => toCents(NaN), RangeError); });
test('toCents Infinity ném RangeError', () => { assert.throws(() => toCents(Infinity), RangeError); });

test('percent 0 giữ nguyên tổng', () => { assert.equal(applyCoupon(1234, { type: 'percent', value: 0 }), 1234); });
test('percent 100 ra 0', () => { assert.equal(applyCoupon(1234, { type: 'percent', value: 100 }), 0); });
test('percent làm tròn nửa lên', () => { assert.equal(applyCoupon(5, { type: 'percent', value: 50 }), 3); });
test('percent value không phải số', () => { bad(1000, { type: 'percent', value: '10' }); });
test('percent NaN', () => { bad(1000, { type: 'percent', value: NaN }); });
test('percent Infinity', () => { bad(1000, { type: 'percent', value: Infinity }); });

test('fixed 0 giữ nguyên tổng', () => { assert.equal(applyCoupon(1000, { type: 'fixed', value: 0 }), 1000); });
test('fixed lớn hơn tổng ra 0', () => { assert.equal(applyCoupon(100, { type: 'fixed', value: 101 }), 0); });
test('fixed âm', () => { bad(1000, { type: 'fixed', value: -1 }); });
test('fixed lẻ 1.5', () => { bad(1000, { type: 'fixed', value: 1.5 }); });

test('coupon null', () => { bad(1000, null); });
test('coupon undefined', () => { bad(1000, undefined); });
test('coupon type lạ', () => { bad(1000, { type: 'bogo', value: 1 }); });
test('coupon thiếu type', () => { bad(1000, { value: 10 }); });

test('totalCents không hợp lệ ném RangeError (giả định ngoài SPEC)', () => {
  bad(-1, { type: 'fixed', value: 0 });
  bad(1.5, { type: 'fixed', value: 0 });
});
