'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, formatMoney, allocate } = require('../src/money');

test('toCents cơ bản', () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0), 0);
});

test('formatMoney', () => {
  assert.equal(formatMoney(123450), '1,234.50');
  assert.equal(formatMoney(-5), '-0.05');
});

test('allocate chia đều', () => {
  assert.deepEqual(allocate(100, [1, 1]), [50, 50]);
});

test('lỗi 1: toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
});

test('lỗi 2: allocate phần dư lớn nhất', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(10, [1, 3]), [3, 7]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

test('toCents biên: âm, 0, mũ, số lớn', () => {
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(-0.001), 0);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(1234567.895), 123456790);
  assert.equal(toCents(19.99), 1999);
});

test('allocate: tổng các phần luôn bằng tổng đầu vào, hòa thì phần trước được trước', () => {
  for (const [t, w] of [[100, [1, 1, 1]], [7, [1, 1]], [1, [1, 1, 1]], [999, [5, 3, 2, 7]], [5, [3]], [1000, [333, 333, 334]]]) {
    assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
  }
  assert.deepEqual(allocate(7, [1, 1]), [4, 3]);
  assert.deepEqual(allocate(1, [1, 1, 1]), [1, 0, 0]);
  assert.deepEqual(allocate(5, [3]), [5]);
  assert.deepEqual(allocate(5, []), []);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

const { freeUnits, checkValidity } = require('../src/promotions');

test('lỗi 3: freeUnits mua X tặng Y', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 7].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 2, 2]);
  assert.deepEqual([0, 2, 3, 4, 5, 9].map((q) => freeUnits(q, 3, 2)), [0, 0, 0, 0, 2, 2]);
});

test('lỗi 4: endsAt hết ngày UTC; lỗi 1: minSubtotal sát ngưỡng', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
  assert.throws(() => checkValidity({ code: 'S', startsAt: '2026-11-30' }, new Date('2026-11-29T23:59:59Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity({ code: 'S', startsAt: '2026-11-30' }, new Date('2026-11-30T00:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity({ code: 'M', minSubtotal: 1.005 }, new Date(), 101));
  assert.throws(() => checkValidity({ code: 'M', minSubtotal: 1.005 }, new Date(), 100), /tối thiểu/);
});
