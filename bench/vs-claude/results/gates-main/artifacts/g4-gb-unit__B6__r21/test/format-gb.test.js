'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
});
test('formatSize biên dưới GB vẫn là MB', () => {
  assert.match(formatSize(1024 ** 3 - 1), / MB$/);
});
test('MB/KB không đổi', () => {
  assert.equal(formatSize(2 * 1024 ** 2), '2 MB');
  assert.equal(formatSize(1536), '1.5 KB');
});
