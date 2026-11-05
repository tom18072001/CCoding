'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.match(formatSize(1024 ** 3 - 1), / MB$/);
  assert.equal(formatSize(2 * 1024 ** 2), '2 MB');
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});
