'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB = 1024 MB', () => {
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
  assert.equal(UNITS.GB, 1073741824);
});

test('formatSize hiển thị GB khi đủ lớn', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(2 * UNITS.GB), '2 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
});

test('formatSize ca biên 1023 MB vs 1024 MB', () => {
  assert.equal(formatSize(1023 * UNITS.MB), '1023 MB');
  assert.equal(formatSize(1024 * UNITS.MB), '1 GB');
});

test('formatSize đơn vị nhỏ hơn vẫn đúng', () => {
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(2 * UNITS.MB), '2 MB');
});

test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * UNITS.GB);
  assert.equal(parseSize('1.5 GB'), 1.5 * UNITS.GB);
  assert.equal(parseSize('1gb'), UNITS.GB);
  assert.equal(parseSize('1024 MB'), parseSize('1 GB'));
  assert.equal(parseSize('2 MB'), 2 * UNITS.MB);
});

test('parseSize từ chối đơn vị lạ', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
});

test('parseSize/formatSize round-trip', () => {
  assert.equal(formatSize(parseSize('3 GB')), '3 GB');
});

test('isValidUnit', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('XB'), false);
  assert.equal(isValidUnit('TB'), false);
});
