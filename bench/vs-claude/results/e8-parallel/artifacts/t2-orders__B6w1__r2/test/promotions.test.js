'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PromotionError, checkValidity, freeUnits, DAY_MS } = require('../src/promotions');

test('freeUnits mua 2 tặng 1 tính theo nhóm 3', () => {
  const r = [[0, 0], [2, 0], [3, 1], [5, 1], [6, 2], [9, 3]];
  for (const [q, e] of r) assert.equal(freeUnits(q, 2, 1), e, `qty=${q}`);
});

test('freeUnits cấu hình khác', () => {
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(10, 3, 2), 4);
});

const promo = { code: 'P', endsAt: '2026-11-30' };

test('endsAt dạng ngày: dùng được tới hết ngày theo UTC', () => {
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T23:59:59.999Z'), 0));
});

test('endsAt dạng ngày: từ chối từ 00:00Z ngày kế tiếp', () => {
  assert.throws(() => checkValidity(promo, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
  assert.throws(() => checkValidity(promo, new Date(Date.parse('2026-11-30T00:00:00Z') + DAY_MS), 0), PromotionError);
});

test('endsAt có kèm giờ: giữ đúng thời điểm', () => {
  const p = { code: 'P', endsAt: '2026-11-30T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T11:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});

test('startsAt hiệu lực từ đầu ngày UTC', () => {
  const p = { code: 'P', startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59.999Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 0));
});
