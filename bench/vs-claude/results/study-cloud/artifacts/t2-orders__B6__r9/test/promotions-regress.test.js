'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freeUnits, checkValidity, PromotionError } = require('../src/promotions');
const { Catalog } = require('../src/catalog');

test('catalog đổi giá sang xu bằng toCents', () => {
  const c = new Catalog([{ sku: 'A', name: 'a', price: 1.005, category: 'x' }]);
  assert.equal(c.get('A').priceCents, 101);
});

test('freeUnits mua 2 tặng 1', () => {
  const r = [0, 1, 2, 3, 4, 5, 6].map((q) => freeUnits(q, 2, 1));
  assert.deepEqual(r, [0, 0, 0, 1, 1, 1, 2]);
});

test('freeUnits cấu hình khác: mua 1 tặng 1, mua 3 tặng 2', () => {
  assert.deepEqual([1, 2, 3, 4].map((q) => freeUnits(q, 1, 1)), [0, 1, 1, 2]);
  assert.deepEqual([3, 4, 5, 6, 8, 10].map((q) => freeUnits(q, 3, 2)), [0, 1, 2, 2, 2, 4]);
});

const promo = { code: 'P', type: 'percent', percent: 10, startsAt: '2026-11-01', endsAt: '2026-11-30' };
const ok = (iso) => checkValidity(promo, new Date(iso), 0);
const bad = (iso, re) => assert.throws(() => checkValidity(promo, new Date(iso), 0), (e) => e instanceof PromotionError && re.test(e.reason));

test('endsAt dạng ngày dùng được hết ngày theo UTC', () => {
  ok('2026-11-30T00:00:00Z');
  ok('2026-11-30T10:00:00Z');
  ok('2026-11-30T23:59:59.999Z');
  bad('2026-12-01T00:00:00Z', /hết hạn/);
});

test('startsAt hiệu lực từ đầu ngày UTC', () => {
  bad('2026-10-31T23:59:59.999Z', /chưa tới/);
  ok('2026-11-01T00:00:00Z');
});

test('endsAt có giờ cụ thể giữ nguyên mốc loại trừ', () => {
  const p = { code: 'P', endsAt: '2026-11-30T12:00:00Z' };
  checkValidity(p, new Date('2026-11-30T11:59:59Z'), 0);
  assert.throws(() => checkValidity(p, new Date('2026-11-30T12:00:00Z'), 0), PromotionError);
});

test('minSubtotal so bằng toCents', () => {
  const p = { code: 'M', minSubtotal: 1.005 };
  assert.throws(() => checkValidity(p, new Date(), 100), PromotionError);
  checkValidity(p, new Date(), 101);
});
