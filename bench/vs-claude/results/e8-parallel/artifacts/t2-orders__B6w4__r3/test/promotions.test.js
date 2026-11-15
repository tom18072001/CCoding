'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 2]);
});

test('freeUnits mua 1 tặng 1 và mua 3 tặng 2', () => {
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
  assert.deepEqual([4, 5, 9, 10].map((q) => freeUnits(q, 3, 2)), [0, 2, 2, 4]);
});

const promo = (o) => ({ code: 'X', type: 'percent', percent: 10, ...o });
const ok = (p, t) => assert.doesNotThrow(() => checkValidity(p, new Date(t), 0));
const bad = (p, t, re) =>
  assert.throws(() => checkValidity(p, new Date(t), 0), (e) => e instanceof PromotionError && re.test(e.reason));

test('endsAt dạng ngày dùng được tới hết ngày (UTC)', () => {
  const p = promo({ endsAt: '2026-03-10' });
  ok(p, '2026-03-10T00:00:00.000Z');
  ok(p, '2026-03-10T23:59:59.999Z');
  bad(p, '2026-03-11T00:00:00.000Z', /hết hạn/);
});

test('endsAt ISO đầy đủ vẫn là mốc loại trừ', () => {
  const p = promo({ endsAt: '2026-03-10T12:00:00Z' });
  ok(p, '2026-03-10T11:59:59.999Z');
  bad(p, '2026-03-10T12:00:00.000Z', /hết hạn/);
});

test('startsAt: chưa tới ngày thì từ chối, từ 00:00Z thì dùng được', () => {
  const p = promo({ startsAt: '2026-03-10' });
  bad(p, '2026-03-09T23:59:59.999Z', /chưa tới/);
  ok(p, '2026-03-10T00:00:00.000Z');
});
