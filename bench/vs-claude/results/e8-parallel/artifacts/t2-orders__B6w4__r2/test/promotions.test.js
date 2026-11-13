'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 2]);
});

test('cấu hình khác: mua 3 tặng 2, mua 1 tặng 1', () => {
  assert.deepEqual([4, 5, 10].map((q) => freeUnits(q, 3, 2)), [0, 2, 4]);
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
});

const promo = { code: 'X', type: 'percent', percent: 10, endsAt: '2026-11-30' };
const ok = (iso, p = promo) => checkValidity(p, new Date(iso), 0);

test('endsAt dạng ngày: dùng được hết ngày UTC', () => {
  ok('2026-11-30T10:00:00Z');
  ok('2026-11-30T23:59:59Z');
});

test('endsAt dạng ngày: từ chối từ 00:00Z hôm sau', () => {
  assert.throws(() => ok('2026-12-01T00:00:00Z'), PromotionError);
});

test('startsAt dạng ngày: hiệu lực từ 00:00Z', () => {
  const p = { code: 'S', startsAt: '2026-11-10' };
  assert.throws(() => ok('2026-11-09T23:59:59Z', p), PromotionError);
  ok('2026-11-10T00:00:00Z', p);
});

test('endsAt dạng có giờ giữ nguyên mốc chính xác', () => {
  const p = { code: 'T', endsAt: '2026-11-30T12:00:00Z' };
  ok('2026-11-30T11:59:59Z', p);
  assert.throws(() => ok('2026-11-30T12:00:00Z', p), PromotionError);
});
