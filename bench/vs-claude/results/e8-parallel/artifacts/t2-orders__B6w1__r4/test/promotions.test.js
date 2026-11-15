'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('mua 2 tặng 1: số món miễn phí theo nhóm 3', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 2]);
});

test('mua X tặng Y cấu hình khác', () => {
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(4, 1, 1), 2);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
});

const promo = { code: 'P', type: 'percent', percent: 10, endsAt: '2026-11-30' };

test('endsAt ngày: hợp lệ tới hết ngày (UTC)', () => {
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T23:59:59.999Z'), 0));
});

test('endsAt ngày: bị từ chối từ 00:00Z ngày kế tiếp', () => {
  assert.throws(() => checkValidity(promo, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('endsAt có kèm giờ giữ nguyên mốc loại trừ', () => {
  const p = { code: 'P', endsAt: '2026-11-30T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T11:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});
