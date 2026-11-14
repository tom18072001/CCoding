'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PromotionError, checkValidity, freeUnits } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1', () => {
  for (const [qty, want] of [[0, 0], [1, 0], [2, 0], [3, 1], [5, 1], [6, 2]]) {
    assert.equal(freeUnits(qty, 2, 1), want, `qty=${qty}`);
  }
});

test('freeUnits: các cấu hình khác', () => {
  assert.equal(freeUnits(3, 3, 1), 0);
  assert.equal(freeUnits(4, 3, 1), 1);
  assert.equal(freeUnits(8, 3, 1), 2);
  assert.equal(freeUnits(1, 1, 1), 0);
  assert.equal(freeUnits(2, 1, 1), 1);
  assert.equal(freeUnits(5, 1, 1), 2);
  assert.equal(freeUnits(5, 1, 2), 2);
  assert.equal(freeUnits(6, 1, 2), 4);
});

test('freeUnits: tham số không hợp lệ trả 0', () => {
  assert.equal(freeUnits(5, 0, 1), 0);
  assert.equal(freeUnits(5, 2, 0), 0);
  assert.equal(freeUnits(5, -1, 1), 0);
  assert.equal(freeUnits(-3, 2, 1), 0);
  assert.equal(freeUnits(5, NaN, 1), 0);
});

test('checkValidity: endsAt dùng được hết ngày', () => {
  const promo = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(promo, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
  assert.throws(() => checkValidity(promo, new Date('2026-12-02T00:00:00Z'), 0), PromotionError);
});

test('checkValidity: startsAt hiệu lực từ đầu ngày', () => {
  const promo = { code: 'X', startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(promo, new Date('2026-11-09T23:59:59.999Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(promo, new Date('2026-11-10T00:00:00Z'), 0));
});
