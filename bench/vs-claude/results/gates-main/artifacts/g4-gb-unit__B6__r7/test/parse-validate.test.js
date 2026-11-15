'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2147483648);
  assert.equal(parseSize('1GB'), 1073741824);
});
test('parseSize chữ thường và thập phân', () => {
  assert.equal(parseSize('1.5gb'), 1610612736);
  assert.equal(parseSize('2 mb'), 2097152);
});
test('parseSize đơn vị cũ', () => {
  assert.equal(parseSize('10 B'), 10);
  assert.equal(parseSize('1 KB'), 1024);
});
test('parseSize chuỗi sai throw TypeError', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize('abc'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
});
test('isValidUnit', () => {
  for (const u of ['B', 'KB', 'MB', 'GB', 'gb']) assert.equal(isValidUnit(u), true);
  assert.equal(isValidUnit('TB'), false);
});
