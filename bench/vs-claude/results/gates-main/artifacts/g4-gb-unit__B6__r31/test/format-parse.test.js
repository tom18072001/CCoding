'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSize } = require('../src/format');
const { parseSize } = require('../src/parse');

const GB = 1024 ** 3;

test('formatSize GB', () => {
  assert.equal(formatSize(GB), '1 GB');
  assert.equal(formatSize(1.5 * GB), '1.5 GB');
  assert.equal(formatSize(2 * GB), '2 GB');
});

test('formatSize biên', () => {
  assert.ok(formatSize(GB - 1).endsWith(' MB'));
  assert.equal(formatSize(1024 ** 2), '1 MB');
  assert.equal(formatSize(1023), '1023 B');
});

test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2147483648);
  assert.equal(parseSize('1.5gb'), 1610612736);
  assert.equal(parseSize(' 1Gb '), GB);
});

test('parseSize TB ném TypeError', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
});

test('vòng format↔parse', () => {
  for (const b of [0, 512, 1024, 1536, 1024 ** 2, 1.5 * 1024 ** 2, GB, 1.5 * GB, 3 * GB]) {
    assert.equal(parseSize(formatSize(b)), b);
  }
});
