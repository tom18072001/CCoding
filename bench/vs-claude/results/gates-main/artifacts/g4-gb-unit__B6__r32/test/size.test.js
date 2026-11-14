'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS', () => { assert.equal(UNITS.MB, 1048576); });
test('formatSize', () => { assert.equal(formatSize(1536), '1.5 KB'); assert.equal(formatSize(2 * 1024 ** 2), '2 MB'); });

test('UNITS GB', () => { assert.equal(UNITS.GB, 1024 * UNITS.MB); assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
  assert.equal(formatSize(1023 * UNITS.MB), '1023 MB');
  assert.equal(formatSize(UNITS.GB - 1), '1024.0 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * UNITS.GB);
  assert.equal(parseSize('1.5 gb'), 1.5 * UNITS.GB);
  assert.equal(parseSize('3 MB'), 3 * UNITS.MB);
  assert.throws(() => parseSize('1 TB'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('KB'), true);
  assert.equal(isValidUnit('TB'), false);
});
