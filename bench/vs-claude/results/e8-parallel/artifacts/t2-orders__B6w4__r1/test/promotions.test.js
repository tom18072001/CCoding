'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 1, 1, 2]);
});

test('freeUnits cấu hình khác: mua 3 tặng 2, mua 1 tặng 1', () => {
  assert.deepEqual([4, 5, 10].map((q) => freeUnits(q, 3, 2)), [0, 2, 4]);
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
});

test('endsAt dạng ngày: dùng được hết ngày đó theo UTC', () => {
  const p = { code: 'X', endsAt: '2026-03-10' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-03-11T00:00:00Z'), 0), PromotionError);
});

test('endsAt dạng timestamp đầy đủ giữ nguyên mốc', () => {
  const p = { code: 'X', endsAt: '2026-03-10T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T11:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-03-10T12:00:00Z'), 0), PromotionError);
});

test('minSubtotal so sánh theo xu', () => {
  const p = { code: 'X', minSubtotal: 19.99 };
  assert.doesNotThrow(() => checkValidity(p, new Date(), 1999));
  assert.throws(() => checkValidity(p, new Date(), 1998), PromotionError);
});
