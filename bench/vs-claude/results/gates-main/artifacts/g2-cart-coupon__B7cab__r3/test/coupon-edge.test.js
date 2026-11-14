'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCoupon } = require('../src/cart');
const { toCents } = require('../src/money');

const pct = (value) => ({ type: 'percent', value });
const fix = (value) => ({ type: 'fixed', value });

test('percent: 0 giữ nguyên, 100 về 0', () => {
  assert.equal(applyCoupon(1234, pct(0)), 1234);
  assert.equal(applyCoupon(1234, pct(100)), 0);
});

test('percent: giá trị lẻ và làm tròn nửa lên', () => {
  assert.equal(applyCoupon(1000, pct(12.5)), 875);
  assert.equal(applyCoupon(5, pct(50)), 3); // 2.5 -> 3
  assert.equal(applyCoupon(1, pct(50)), 1); // 0.5 -> 1
  assert.equal(applyCoupon(999, pct(33.3)), Math.round((999 * 66.7) / 100));
});

test('total = 0', () => {
  assert.equal(applyCoupon(0, pct(10)), 0);
  assert.equal(applyCoupon(0, fix(0)), 0);
  assert.equal(applyCoupon(0, fix(500)), 0);
});

test('fixed: 0, bằng tổng, lớn hơn tổng', () => {
  assert.equal(applyCoupon(1000, fix(0)), 1000);
  assert.equal(applyCoupon(1000, fix(1000)), 0);
  assert.equal(applyCoupon(1000, fix(1001)), 0);
  assert.equal(applyCoupon(1000, fix(999)), 1);
});

test('kết quả luôn là số nguyên', () => {
  for (const t of [0, 1, 7, 99, 333, 1999, 100001]) {
    for (const v of [0, 0.1, 1, 12.5, 33.333, 50, 99.99, 100]) {
      const r = applyCoupon(t, pct(v));
      assert.ok(Number.isInteger(r), `percent ${v} trên ${t} -> ${r}`);
      assert.ok(r >= 0 && r <= t);
    }
    assert.ok(Number.isInteger(applyCoupon(t, fix(3))));
  }
});

test('coupon sai kiểu -> RangeError', () => {
  for (const c of [null, undefined, [], [pct(10)], 'percent', 10, true, {}, { value: 5 },
    { type: 'percent' }, { type: 'fixed' }, { type: 'PERCENT', value: 10 }, { type: 'bogus', value: 1 }]) {
    assert.throws(() => applyCoupon(1000, c), RangeError, JSON.stringify(c));
  }
});

test('value là chuỗi/NaN/Infinity/null -> RangeError', () => {
  for (const type of ['percent', 'fixed']) {
    for (const value of ['5', '', NaN, Infinity, -Infinity, null, undefined, {}, []]) {
      assert.throws(() => applyCoupon(1000, { type, value }), RangeError, `${type} ${String(value)}`);
    }
  }
});

test('percent ngoài [0,100] -> RangeError', () => {
  for (const v of [-0.01, -1, 100.01, 101, 1000]) {
    assert.throws(() => applyCoupon(1000, pct(v)), RangeError, String(v));
  }
});

test('fixed âm hoặc không nguyên -> RangeError', () => {
  for (const v of [-1, -0.5, 0.5, 1.5, 99.99]) {
    assert.throws(() => applyCoupon(1000, fix(v)), RangeError, String(v));
  }
});

test('toCents: 19.99, 1.005, 0', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0), 0);
});

test('toCents: âm/Infinity/NaN -> RangeError', () => {
  for (const x of [-1, -0.01, Infinity, -Infinity, NaN]) {
    assert.throws(() => toCents(x), RangeError, String(x));
  }
});
