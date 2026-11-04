'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB = 1024 ** 3', () => { assert.equal(UNITS.GB, 1073741824); });
test('formatSize GB nguyên', () => { assert.equal(formatSize(1073741824), '1 GB'); });
test('formatSize GB thập phân', () => { assert.equal(formatSize(1610612736), '1.5 GB'); });
test('formatSize biên dưới GB vẫn là MB', () => { assert.equal(formatSize(1073741824 - 1048576), '1023 MB'); });
test('formatSize MB/KB/B không đổi', () => {
  assert.equal(formatSize(1048576), '1 MB');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(10), '10 B');
});
