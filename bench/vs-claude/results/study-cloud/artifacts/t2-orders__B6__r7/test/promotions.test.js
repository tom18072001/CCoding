'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('mua 2 tặng 1: 2/3/5/6 hộp', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(0, 2, 1), 0);
});

test('mua X tặng Y tổng quát', () => {
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
});

const promo = { code: 'X', endsAt: '2026-11-30' };
const reason = (p, now, sub = 0) => {
  try {
    checkValidity(p, new Date(now), sub);
    return null;
  } catch (e) {
    assert.ok(e instanceof PromotionError);
    return e.reason;
  }
};

test('endsAt: dùng được tới hết ngày, từ chối từ 00:00:00Z ngày kế tiếp', () => {
  assert.equal(reason(promo, '2026-11-30T10:00:00Z'), null);
  assert.equal(reason(promo, '2026-11-30T23:59:59Z'), null);
  assert.equal(reason(promo, '2026-12-01T00:00:00Z'), 'đã hết hạn');
});

test('startsAt: hiệu lực từ 00:00:00Z', () => {
  const p = { code: 'S', startsAt: '2026-11-01' };
  assert.equal(reason(p, '2026-10-31T23:59:59Z'), 'chưa tới ngày áp dụng');
  assert.equal(reason(p, '2026-11-01T00:00:00Z'), null);
});

test('endsAt có kèm giờ dùng đúng mốc đó', () => {
  const p = { code: 'T', endsAt: '2026-11-30T12:00:00Z' };
  assert.equal(reason(p, '2026-11-30T11:59:59Z'), null);
  assert.equal(reason(p, '2026-11-30T12:00:00Z'), 'đã hết hạn');
});

test('minSubtotal dùng toCents (1.005 → 101 xu)', () => {
  const p = { code: 'M', minSubtotal: 1.005 };
  assert.equal(reason(p, '2026-01-01T00:00:00Z', 100), 'chưa đạt giá trị tối thiểu');
  assert.equal(reason(p, '2026-01-01T00:00:00Z', 101), null);
});
