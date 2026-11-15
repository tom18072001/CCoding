'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 1, 2]);
});

test('freeUnits nhiều cấu hình X/Y', () => {
  assert.equal(freeUnits(3, 3, 1), 0);
  assert.equal(freeUnits(4, 3, 1), 1);
  assert.equal(freeUnits(7, 3, 1), 1);
  assert.equal(freeUnits(8, 3, 1), 2);
  assert.equal(freeUnits(5, 1, 1), 2);
  assert.equal(freeUnits(9, 2, 2), 4);
  assert.equal(freeUnits(3, 2, 2), 0);
});

test('endsAt dạng ngày dùng được tới hết ngày (UTC)', () => {
  const promo = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(promo, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('endsAt có kèm giờ giữ nguyên mốc', () => {
  const promo = { code: 'X', endsAt: '2026-11-30T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T11:59:59.999Z'), 0));
  assert.throws(() => checkValidity(promo, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});

test('startsAt hiệu lực từ đầu ngày (UTC)', () => {
  const promo = { code: 'X', startsAt: '2026-11-01' };
  assert.throws(() => checkValidity(promo, new Date('2026-10-31T23:59:59.999Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-01T00:00:00Z'), 0));
});
