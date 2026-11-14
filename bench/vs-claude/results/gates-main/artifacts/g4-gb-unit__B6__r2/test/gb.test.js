'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB bằng 1024 lần MB', () => {
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
  assert.equal(UNITS.GB, 1073741824);
});

test('parseSize hỗ trợ GB', () => {
  assert.equal(parseSize('1GB'), 1024 ** 3);
  assert.equal(parseSize('2 GB'), 2 * 1024 ** 3);
  assert.equal(parseSize('1.5gb'), 1.5 * 1024 ** 3);
});

test('parseSize vẫn xử lý MB', () => {
  assert.equal(parseSize('1MB'), 1048576);
  assert.equal(parseSize('2 mb'), 2 * 1048576);
  assert.equal(parseSize('1024MB'), UNITS.GB);
});

test('parseSize từ chối đơn vị lạ', () => {
  assert.throws(() => parseSize('1TB'), TypeError);
});

test('formatSize in GB khi đạt ngưỡng', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(2 * UNITS.GB), '2 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
});

test('formatSize vẫn in MB dưới ngưỡng GB', () => {
  assert.equal(formatSize(UNITS.GB - UNITS.MB), '1023 MB');
  assert.equal(formatSize(UNITS.MB), '1 MB');
  assert.equal(formatSize(2 * UNITS.MB), '2 MB');
});

test('isValidUnit', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('XB'), false);
  assert.equal(isValidUnit('TB'), false);
});
