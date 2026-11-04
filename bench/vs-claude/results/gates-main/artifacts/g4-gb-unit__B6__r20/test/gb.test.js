'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

const GB = 1024 ** 3;

test('UNITS.GB', () => {
  assert.equal(UNITS.GB, GB);
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
});

test('formatSize GB', () => {
  assert.equal(formatSize(GB), '1 GB');
  assert.equal(formatSize(1.5 * GB), '1.5 GB');
  assert.equal(formatSize(1024 * UNITS.MB), '1 GB');
  assert.equal(formatSize(GB - 1), '1024.0 MB');
  assert.equal(formatSize(1023 * UNITS.MB), '1023 MB');
  assert.equal(formatSize(512 * UNITS.MB), '512 MB');
});

test('parseSize GB', () => {
  assert.equal(parseSize('1GB'), GB);
  assert.equal(parseSize('1 gb'), GB);
  assert.equal(parseSize('2.5 GB'), 2.5 * GB);
  assert.equal(parseSize('0.1 GB'), Math.round(0.1 * GB));
  assert.ok(Number.isInteger(parseSize('0.3333 GB')));
});

test('parseSize lỗi', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize('-1 GB'), TypeError);
});

test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
  assert.equal(isValidUnit('XB'), false);
});

test('round-trip parse → format', () => {
  for (const s of ['1 GB', '1.5 GB', '2 GB', '512 MB']) {
    assert.equal(formatSize(parseSize(s)), s);
  }
});
