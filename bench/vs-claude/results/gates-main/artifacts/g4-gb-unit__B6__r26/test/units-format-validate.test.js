'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => {
  assert.equal(UNITS.GB, 1073741824);
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
});

test('formatSize GB', () => {
  assert.equal(formatSize(3 * 1024 ** 3), '3 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3), '1 GB');
});

test('formatSize biên dưới GB vẫn dùng MB', () => {
  assert.match(formatSize(1024 ** 3 - 1), /MB$/);
  assert.equal(formatSize(2 * 1024 ** 2), '2 MB');
});

test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});
