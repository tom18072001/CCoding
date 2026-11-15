'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); assert.equal(UNITS.GB, 1024 * UNITS.MB); });
test('formatSize GB', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
  assert.equal(formatSize(5 * UNITS.GB), '5 GB');
});
test('formatSize ngưỡng biên MB→GB', () => {
  assert.equal(formatSize(UNITS.GB - 1), '1024.0 MB');
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(UNITS.MB), '1 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * UNITS.GB);
  assert.equal(parseSize('1.5 GB'), 1.5 * UNITS.GB);
  assert.equal(parseSize('1gb'), UNITS.GB);
  assert.equal(parseSize('1024 MB'), UNITS.GB);
  assert.throws(() => parseSize('1 TB'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});
test('round-trip GB', () => {
  for (const n of [1, 2, 1.5, 10]) assert.equal(parseSize(formatSize(n * UNITS.GB)), n * UNITS.GB);
});
