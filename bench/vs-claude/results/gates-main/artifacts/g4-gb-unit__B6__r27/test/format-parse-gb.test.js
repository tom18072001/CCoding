'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');

test('formatSize GB', () => {
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
  assert.equal(formatSize(1024 ** 3 - 1), '1024.0 MB');
  assert.equal(formatSize(1024 ** 2), '1 MB');
});

test('parseSize GB', () => {
  assert.equal(parseSize('2GB'), 2 * 1024 ** 3);
  assert.equal(parseSize('1.5 gb'), 1.5 * 1024 ** 3);
  assert.equal(parseSize('1 MB'), 1024 ** 2);
  assert.throws(() => parseSize('1 TB'), TypeError);
});

test('round-trip parse(format(x))', () => {
  for (const x of [1024 ** 3, 1.5 * 1024 ** 3, 3 * 1024 ** 3, 1024 ** 2, 2048, 512]) {
    assert.equal(parseSize(formatSize(x)), x);
  }
});
