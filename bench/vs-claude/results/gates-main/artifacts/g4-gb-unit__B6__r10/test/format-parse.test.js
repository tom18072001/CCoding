'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');

test('formatSize hỗ trợ GB và ca biên', () => {
  assert.strictEqual(formatSize(1073741824), '1 GB');
  assert.strictEqual(formatSize(1610612736), '1.5 GB');
  assert.strictEqual(formatSize(1073741823), '1024.0 MB');
  assert.strictEqual(formatSize(1048576), '1 MB');
  assert.strictEqual(formatSize(1024), '1 KB');
  assert.strictEqual(formatSize(1023), '1023 B');
});

test('parseSize hỗ trợ GB', () => {
  assert.strictEqual(parseSize('2 GB'), 2147483648);
  assert.strictEqual(parseSize('1.5gb'), 1610612736);
  assert.strictEqual(parseSize('1 MB'), 1048576);
});

test('parseSize ném TypeError với đơn vị sai', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
});

test('round-trip format <-> parse', () => {
  for (const b of [0, 512, 1024, 1048576, 1073741824, 1610612736, 5368709120]) {
    assert.strictEqual(parseSize(formatSize(b)), b);
  }
});
