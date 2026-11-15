'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkValidity, freeUnits } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 1, 2]);
});

test('freeUnits: cấu hình khác', () => {
  assert.equal(freeUnits(5, 1, 1), 2);
  assert.equal(freeUnits(9, 3, 2), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(10, 1, 3), 6);
});

const P = { code: 'X', endsAt: '2026-03-10' };
const at = (s) => new Date(s);

test('endsAt dạng ngày dùng được hết ngày UTC đó', () => {
  assert.doesNotThrow(() => checkValidity(P, at('2026-03-10T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(P, at('2026-03-10T23:59:59.999Z'), 0));
});

test('endsAt dạng ngày bị từ chối từ 00:00:00Z ngày kế tiếp', () => {
  assert.throws(() => checkValidity(P, at('2026-03-11T00:00:00Z'), 0), /hết hạn/);
});

test('endsAt có giờ giữ nguyên mốc', () => {
  const p = { code: 'X', endsAt: '2026-03-10T12:00:00Z' };
  assert.doesNotThrow(() => checkValidity(p, at('2026-03-10T11:59:59Z'), 0));
  assert.throws(() => checkValidity(p, at('2026-03-10T12:00:00Z'), 0), /hết hạn/);
});

test('startsAt và minSubtotal vẫn đúng', () => {
  assert.throws(() => checkValidity({ code: 'X', startsAt: '2026-03-10' }, at('2026-03-09T23:59:59Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity({ code: 'X', startsAt: '2026-03-10' }, at('2026-03-10T00:00:00Z'), 0));
  assert.throws(() => checkValidity({ code: 'X', minSubtotal: 10 }, at('2026-01-01T00:00:00Z'), 999), /tối thiểu/);
});
