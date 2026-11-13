'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1', () => {
  [[2, 0], [3, 1], [5, 1], [6, 2], [1, 0]].forEach(([q, e]) => assert.strictEqual(freeUnits(q, 2, 1), e));
});
test('freeUnits: mua 3 tặng 2', () => {
  [[3, 0], [4, 1], [5, 2], [8, 2], [10, 4]].forEach(([q, e]) => assert.strictEqual(freeUnits(q, 3, 2), e));
});
test('freeUnits: đầu vào không hợp lệ', () => {
  assert.strictEqual(freeUnits(0, 2, 1), 0);
  assert.strictEqual(freeUnits(-1, 2, 1), 0);
  assert.strictEqual(freeUnits(5, -1, 1), 0);
  assert.strictEqual(freeUnits(5, 2, 0), 0);
});
test('checkValidity: endsAt date-only dùng được hết ngày', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});
test('checkValidity: startsAt giữ nguyên', () => {
  const p = { code: 'X', startsAt: '2026-11-01' };
  assert.throws(() => checkValidity(p, new Date('2026-10-31T23:59:59.999Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-01T00:00:00Z'), 0));
});
test('checkValidity: endsAt có giờ giữ ngữ nghĩa cũ', () => {
  const p = { code: 'X', endsAt: '2026-11-30T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T11:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});
