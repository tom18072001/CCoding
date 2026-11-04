'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');
const { formatSize } = require('../src/format');

test('parseSize hỗ trợ GB', () => {
  assert.strictEqual(parseSize('1GB'), 1073741824);
  assert.strictEqual(parseSize('1.5 GB'), 1610612736);
  assert.strictEqual(parseSize('2 gb'), 2147483648);
});

test('parseSize MB vẫn đúng', () => {
  assert.strictEqual(parseSize('512 MB'), 512 * 1024 ** 2);
});

test('parseSize ném TypeError với đơn vị lạ hoặc rỗng', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize(''), TypeError);
});

test('round-trip GB', () => {
  assert.strictEqual(formatSize(parseSize('3 GB')), '3 GB');
});
