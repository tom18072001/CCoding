'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize biên', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1023 B');
  assert.equal(formatSize(1023 * 1024 ** 2), '1023 MB');
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
});
test('isValidUnit', () => {
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
});
