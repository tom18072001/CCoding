'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { isValidUnit } = require('../src/validate');
const { formatSize } = require('../src/format');

test('UNITS.GB = 1024**3', () => {
  assert.equal(UNITS.GB, 1024 ** 3);
});

test('isValidUnit hỗ trợ GB/gb', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});

test('formatSize với GB và biên', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3 - 1), '1024.0 MB');
  assert.equal(formatSize(1024 ** 2), '1 MB');
  assert.equal(formatSize(1024), '1 KB');
  assert.equal(formatSize(10), '10 B');
});
