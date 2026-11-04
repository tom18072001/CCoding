'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB = 1024 ** 3', () => {
  assert.equal(UNITS.GB, 1073741824);
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
});

test('formatSize ở GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(2 * 1024 ** 3), '2 GB');
});

test('formatSize GB không nguyên', () => {
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
});

test('ranh giới MB/GB', () => {
  assert.match(formatSize(1024 ** 3 - 1), /MB$/);
  assert.equal(formatSize(1024 ** 3 - 1024 ** 2), '1023 MB');
});
