'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 1, 2]);
});

test('freeUnits mua 1 tặng 1 và mua 3 tặng 2', () => {
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
  assert.deepEqual([3, 4, 5, 10].map((q) => freeUnits(q, 3, 2)), [0, 1, 2, 4]);
});

test('endsAt dùng được hết ngày cuối (UTC)', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('startsAt và minSubtotal giữ nguyên', () => {
  const p = { code: 'X', startsAt: '2026-11-01', minSubtotal: 10 };
  assert.throws(() => checkValidity(p, new Date('2026-10-31T23:59:59Z'), 2000), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-01T00:00:00Z'), 1000));
  assert.throws(() => checkValidity(p, new Date('2026-11-02T00:00:00Z'), 999), PromotionError);
});
