'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1 chỉ tặng khi đủ nhóm', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(0, 2, 1), 0);
});

test('freeUnits: các cấu hình khác', () => {
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('checkValidity: endsAt dùng được hết ngày UTC', () => {
  const p = { code: 'A', endsAt: '2025-03-10' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-10T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2025-03-11T00:00:00Z'), 0), PromotionError);
});

test('checkValidity: startsAt từ 00:00:00Z đầu ngày', () => {
  const p = { code: 'B', startsAt: '2025-03-10' };
  assert.throws(() => checkValidity(p, new Date('2025-03-09T23:59:59.999Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2025-03-10T00:00:00Z'), 0));
});

test('checkValidity: minSubtotal giữ nguyên', () => {
  const p = { code: 'C', minSubtotal: 10 };
  assert.throws(() => checkValidity(p, new Date(), 999), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date(), 1000));
});
