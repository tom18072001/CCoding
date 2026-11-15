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
test('formatSize GB và ranh giới MB→GB', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
  assert.equal(formatSize(UNITS.GB - 1), '1024.0 MB');
  assert.equal(formatSize(1023 * UNITS.MB), '1023 MB');
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1536), '1.5 KB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * UNITS.GB);
  assert.equal(parseSize('1.5 GB'), 1.5 * UNITS.GB);
  assert.equal(parseSize('1gb'), UNITS.GB);
  assert.equal(parseSize('1024 MB'), UNITS.GB);
  assert.equal(parseSize('2MB'), 2 * UNITS.MB);
});
test('parseSize đơn vị không hợp lệ', () => {
  assert.throws(() => parseSize('1TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
});
test('isValidUnit', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
  assert.equal(isValidUnit('toString'), false);
});
