'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('GB', () => {
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
  assert.equal(formatSize(2 * 1024 ** 3), '2 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3 - 1), '1024.0 MB');
  assert.equal(parseSize('1 GB'), 1024 ** 3);
  assert.equal(parseSize('0.5gb'), 512 * 1024 ** 2);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});

test('UNITS', () => { assert.equal(UNITS.MB, 1048576); });
test('formatSize', () => { assert.equal(formatSize(1536), '1.5 KB'); assert.equal(formatSize(2 * 1024 ** 2), '2 MB'); });
