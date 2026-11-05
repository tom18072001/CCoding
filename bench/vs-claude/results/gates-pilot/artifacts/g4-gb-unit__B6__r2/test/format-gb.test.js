'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSize } = require('../src/format');

test('formatSize dùng GB từ 1024 ** 3', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(2 * 1024 ** 3), '2 GB');
});
test('formatSize dưới 1 GB vẫn dùng MB', () => {
  assert.match(formatSize(1024 ** 3 - 1), / MB$/);
});
test('formatSize giữ hành vi MB/KB/B', () => {
  assert.equal(formatSize(5 * 1024 ** 2), '5 MB');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(512), '512 B');
});
