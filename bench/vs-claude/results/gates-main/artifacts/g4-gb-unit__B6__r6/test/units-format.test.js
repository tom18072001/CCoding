'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB', () => {
  assert.equal(UNITS.GB, 1073741824);
  assert.equal(UNITS.GB, UNITS.MB * 1024);
});

test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3 - 1), '1024.0 MB');
  assert.equal(formatSize(1023 * 1024 ** 2), '1023 MB');
  assert.equal(formatSize(1024 ** 2), '1 MB');
  assert.equal(formatSize(5000 * 1024 ** 3), '5000 GB');
});
