'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS', () => { assert.equal(UNITS.MB, 1048576); });
test('UNITS.GB', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3 - 1), '1024.0 MB');
  assert.ok(formatSize(1024 ** 3 - 1).endsWith(' MB'));
});
test('formatSize',() => { assert.equal(formatSize(1536), '1.5 KB'); assert.equal(formatSize(2 * 1024 ** 2), '2 MB'); });
