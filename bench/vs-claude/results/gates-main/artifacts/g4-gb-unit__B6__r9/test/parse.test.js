'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');

test('GB nguyên', () => { assert.equal(parseSize('1GB'), 1073741824); });
test('GB thập phân', () => { assert.equal(parseSize('1.5 gb'), 1610612736); });
test('GB chữ thường, khoảng trắng', () => {
  assert.equal(parseSize('  2 gB '), 2 * 1073741824);
});
test('hồi quy B/KB/MB', () => {
  assert.equal(parseSize('5B'), 5);
  assert.equal(parseSize('1 kb'), 1024);
  assert.equal(parseSize('1MB'), 1048576);
});
test('đơn vị không hợp lệ ném TypeError', () => {
  assert.throws(() => parseSize('2 TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize('1 XB'), TypeError);
});
