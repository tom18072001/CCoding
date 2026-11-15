'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

const GB = 1024 ** 3;

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(3 * GB), '3 GB');
  assert.equal(formatSize(1.5 * GB), '1.5 GB');
  assert.equal(formatSize(GB), '1 GB');
  assert.equal(formatSize(GB - 1), '1024.0 MB');
  assert.equal(formatSize(1024 ** 2), '1 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * GB);
  assert.equal(parseSize('1.5 gb'), 1.5 * GB);
  assert.equal(parseSize('  1 Gb '), GB);
  assert.equal(parseSize('2MB'), 2 * 1024 ** 2);
  assert.throws(() => parseSize('2TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize('1 G B'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('TB'), false);
});
test('parse <-> format symmetry', () => {
  for (const s of ['3 GB', '1.5 GB', '2 MB', '1.5 KB', '5 B']) assert.equal(formatSize(parseSize(s)), s);
});
