'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB = 1024 * MB', () => {
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
  assert.equal(UNITS.GB, 1073741824);
});
test('formatSize GB', () => {
  assert.equal(formatSize(1024 * UNITS.MB), '1 GB');
  assert.equal(formatSize(1536 * UNITS.MB), '1.5 GB');
  assert.equal(formatSize(10 * UNITS.GB), '10 GB');
});
test('formatSize ngay dưới 1 GB', () => {
  assert.equal(formatSize(UNITS.GB - 1), '1024.0 MB');
  assert.equal(formatSize(1023 * UNITS.MB), '1023 MB');
});
test('formatSize giữ hành vi B/KB/MB', () => {
  assert.equal(formatSize(500), '500 B');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(2 * UNITS.MB), '2 MB');
});
