'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freeUnits, checkValidity, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 1, 2]);
});

test('freeUnits cấu hình khác: mua 3 tặng 2, mua 1 tặng 1', () => {
  assert.deepEqual([3, 4, 5, 6, 8, 10].map((q) => freeUnits(q, 3, 2)), [0, 1, 2, 2, 2, 4]);
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
});

test('endsAt dạng ngày: dùng được hết ngày theo UTC', () => {
  const p = { code: 'A', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('endsAt có kèm giờ giữ nguyên', () => {
  const p = { code: 'A', endsAt: '2026-11-30T10:00Z' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T09:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0), PromotionError);
});

test('startsAt hiệu lực từ 00:00Z', () => {
  const p = { code: 'A', startsAt: '2026-11-01' };
  assert.throws(() => checkValidity(p, new Date('2026-10-31T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-01T00:00:00Z'), 0));
});
