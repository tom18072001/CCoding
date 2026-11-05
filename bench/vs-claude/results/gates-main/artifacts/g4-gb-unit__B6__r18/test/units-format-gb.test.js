'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { UNITS } = require('../src/units');
const { formatSize } = require('../src/format');

test('UNITS.GB === 1024^3', () => {
  assert.strictEqual(UNITS.GB, 1073741824);
});

test('formatSize dùng GB', () => {
  assert.strictEqual(formatSize(1024 ** 3), '1 GB');
  assert.strictEqual(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.strictEqual(formatSize(2 * 1024 ** 3), '2 GB');
});

test('formatSize biên: dưới 1 GB vẫn là MB', () => {
  assert.ok(formatSize(1024 ** 3 - 1).endsWith(' MB'));
});

test('formatSize các ca cũ không đổi', () => {
  assert.strictEqual(formatSize(512), '512 B');
  assert.strictEqual(formatSize(1024), '1 KB');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(1024 ** 2), '1 MB');
  assert.strictEqual(formatSize(1.5 * 1024 ** 2), '1.5 MB');
});
