'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');

test('parseSize hỗ trợ GB', () => {
  assert.equal(parseSize('1GB'), 1073741824);
  assert.equal(parseSize('1.5 gb'), 1.5 * 1024 ** 3);
  assert.equal(parseSize('2 GB'), 2147483648);
});
test('parseSize ném TypeError với TB', () => {
  assert.throws(() => parseSize('1TB'), TypeError);
});
test('parseSize giữ hành vi B/KB/MB', () => {
  assert.equal(parseSize('5 B'), 5);
  assert.equal(parseSize('2 KB'), 2048);
  assert.equal(parseSize('3 MB'), 3 * 1024 ** 2);
});
