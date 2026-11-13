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
