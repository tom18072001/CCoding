'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');

test('formatSize chọn GB từ đúng 1 GB', () => {
  assert.equal(formatSize(UNITS.GB), '1 GB');
  assert.equal(formatSize(1024 * UNITS.MB), '1 GB');
  assert.equal(formatSize(1.5 * UNITS.GB), '1.5 GB');
});
test('formatSize dưới 1 GB vẫn là MB', () => {
  assert.equal(formatSize(UNITS.GB - UNITS.MB), '1023 MB');
  assert.equal(formatSize(UNITS.MB), '1 MB');
});
test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2 * UNITS.GB);
  assert.equal(parseSize('1.5gb'), 1.5 * UNITS.GB);
  assert.equal(parseSize('1024 MB'), UNITS.GB);
});
test('round-trip', () => {
  for (const s of ['1 GB', '2.5 GB', '1023 MB', '512 KB', '10 B']) {
    assert.equal(formatSize(parseSize(s)), s);
  }
});
