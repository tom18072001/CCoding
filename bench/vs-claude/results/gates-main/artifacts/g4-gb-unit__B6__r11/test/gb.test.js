'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 2), '1 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('1GB'), 1024 ** 3);
  assert.equal(parseSize('2.5 gb'), 2.5 * 1024 ** 3);
  assert.equal(parseSize(formatSize(3 * 1024 ** 3)), 3 * 1024 ** 3);
  assert.throws(() => parseSize('1TB'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});
