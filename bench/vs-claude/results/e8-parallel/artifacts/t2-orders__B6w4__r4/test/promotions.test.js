'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((q) => freeUnits(q, 2, 1)), [0, 0, 1, 1, 1, 2, 2]);
});

test('freeUnits tổng quát (mua 1 tặng 1, mua 3 tặng 2)', () => {
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
  assert.deepEqual([3, 4, 5, 8, 9].map((q) => freeUnits(q, 3, 2)), [0, 1, 2, 2, 3]);
});

test('endsAt chỉ ngày: dùng được hết ngày đó (UTC)', () => {
  const p = { code: 'X', endsAt: '2025-03-10' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-10T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2025-03-11T00:00:00Z'), 0), PromotionError);
});

test('endsAt có giờ đầy đủ giữ nguyên; startsAt từ đầu ngày', () => {
  const p = { code: 'X', startsAt: '2025-03-01', endsAt: '2025-03-10T12:00:00Z' };
  assert.throws(() => checkValidity(p, new Date('2025-03-10T12:00:00Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-10T11:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2025-02-28T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-01T00:00:00Z'), 0));
});
