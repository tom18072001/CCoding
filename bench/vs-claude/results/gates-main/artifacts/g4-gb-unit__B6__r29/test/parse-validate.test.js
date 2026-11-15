'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => {
  assert.strictEqual(parseSize('1GB'), 1024 ** 3);
  assert.strictEqual(parseSize('1gb'), 1024 ** 3);
  assert.strictEqual(parseSize(' 2 GB '), 2 * 1024 ** 3);
  assert.strictEqual(parseSize('1.5GB'), 1.5 * 1024 ** 3);
  assert.strictEqual(parseSize('1GB'), 1024 * parseSize('1MB'));
});
test('parseSize hồi quy MB/KB/B', () => {
  assert.strictEqual(parseSize('1MB'), 1048576);
  assert.strictEqual(parseSize('3 mb'), 3 * 1048576);
  assert.strictEqual(parseSize('2KB'), 2048);
  assert.strictEqual(parseSize('5B'), 5);
});
test('parseSize từ chối đơn vị sai', () => {
  assert.throws(() => parseSize('1TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize('1toString'), TypeError);
});
test('isValidUnit', () => {
  for (const u of ['B', 'KB', 'MB', 'GB', 'gb', 'mb']) assert.strictEqual(isValidUnit(u), true);
  for (const u of ['TB', '', 'toString', 'constructor']) assert.strictEqual(isValidUnit(u), false);
});
