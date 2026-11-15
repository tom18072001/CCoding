'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB = 1024 MB', () => {
  assert.equal(UNITS.GB, 1073741824);
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
});
test('formatSize GB', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(1024 * UNITS.MB), '1 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
  assert.equal(formatSize(UNITS.GB - 1), '1024.0 MB');
  assert.equal(formatSize(UNITS.MB), '1 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('1 GB'), UNITS.GB);
  assert.equal(parseSize('2gb'), 2 * UNITS.GB);
  assert.equal(parseSize('0.5 Gb'), UNITS.GB / 2);
  assert.equal(parseSize('1024 MB'), parseSize('1 GB'));
  assert.equal(parseSize('3 MB'), 3 * UNITS.MB);
  assert.throws(() => parseSize('1 TB'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
});
