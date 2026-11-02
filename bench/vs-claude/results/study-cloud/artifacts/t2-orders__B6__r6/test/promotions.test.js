'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('mua 2 tặng 1: 2→0, 3→1, 5→1, 6→2', () => {
  assert.deepEqual([2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 1, 1, 2]);
  assert.equal(freeUnits(0, 2, 1), 0);
});

test('mua X tặng Y tổng quát', () => {
  assert.deepEqual([2, 3, 4, 5, 8].map((q) => freeUnits(q, 3, 2)), [0, 0, 0, 2, 2]);
  assert.equal(freeUnits(10, 1, 1), 5);
});

test('endsAt dùng được tới hết ngày theo UTC', () => {
  const promo = { code: 'X', type: 'percent', percent: 10, endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(promo, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('startsAt vẫn hiệu lực từ đầu ngày UTC', () => {
  const promo = { code: 'X', type: 'percent', percent: 10, startsAt: '2026-11-01' };
  assert.throws(() => checkValidity(promo, new Date('2026-10-31T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-01T00:00:00Z'), 0));
});
