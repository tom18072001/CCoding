'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(3 * 1024 ** 3), '3 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
});
test('formatSize biên: dưới 1 GB vẫn là MB', () => {
  assert.match(formatSize(1024 ** 3 - 1), /MB$/);
});
test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2147483648);
  assert.equal(parseSize('1.5gb'), 1.5 * 1024 ** 3);
  assert.throws(() => parseSize('2 TB'), TypeError);
});
test('isValidUnit GB', () => {
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('GB'), true);
});
test('round-trip GB', () => { assert.equal(parseSize(formatSize(3 * 1024 ** 3)), 3 * 1024 ** 3); });
