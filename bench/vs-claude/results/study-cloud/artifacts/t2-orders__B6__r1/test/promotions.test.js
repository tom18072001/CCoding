'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([1, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 1, 1, 2]);
});

test('freeUnits mua 3 tặng 2', () => {
  assert.deepEqual([4, 5, 9, 10].map((q) => freeUnits(q, 3, 2)), [0, 2, 2, 4]);
});

test('endsAt dùng được hết ngày theo UTC', () => {
  const p = { code: 'X', endsAt: '2026-03-10' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-03-11T00:00:00Z'), 0), PromotionError);
});

test('startsAt có hiệu lực từ 00:00Z', () => {
  const p = { code: 'X', startsAt: '2026-03-10' };
  assert.throws(() => checkValidity(p, new Date('2026-03-09T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-03-10T00:00:00Z'), 0));
});
