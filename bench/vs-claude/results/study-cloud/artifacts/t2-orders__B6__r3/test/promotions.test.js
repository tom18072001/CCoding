'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1', () => {
  for (const [q, f] of [[0, 0], [1, 0], [2, 0], [3, 1], [5, 1], [6, 2], [9, 3]]) assert.equal(freeUnits(q, 2, 1), f);
});

test('freeUnits: cấu hình khác', () => {
  assert.equal(freeUnits(5, 1, 1), 2);
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('endsAt dạng ngày dùng được hết ngày (UTC)', () => {
  const p = { code: 'A', endsAt: '2026-11-30' };
  checkValidity(p, new Date('2026-11-30T00:00:00Z'), 0);
  checkValidity(p, new Date('2026-11-30T23:59:59Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('endsAt có giờ giữ nguyên thời điểm', () => {
  const p = { code: 'A', endsAt: '2026-11-30T12:00:00Z' };
  checkValidity(p, new Date('2026-11-30T11:59:59Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});

test('startsAt vẫn hiệu lực từ đầu ngày', () => {
  const p = { code: 'A', startsAt: '2026-11-30' };
  assert.throws(() => checkValidity(p, new Date('2026-11-29T23:59:59Z'), 0), PromotionError);
  checkValidity(p, new Date('2026-11-30T00:00:00Z'), 0);
});
