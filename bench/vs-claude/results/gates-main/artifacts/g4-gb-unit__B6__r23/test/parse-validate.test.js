'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize hỗ trợ GB', () => {
  assert.equal(parseSize('2 GB'), 2147483648);
  assert.equal(parseSize('1.5gb'), 1610612736);
  assert.equal(parseSize('1GB'), 1073741824);
});

test('parseSize giữ hành vi B/KB/MB', () => {
  assert.equal(parseSize('10 B'), 10);
  assert.equal(parseSize('1 kb'), 1024);
  assert.equal(parseSize('2 MB'), 2097152);
});

test('parseSize ném TypeError với đơn vị/chuỗi sai', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize(''), TypeError);
});

test('isValidUnit', () => {
  for (const u of ['B', 'KB', 'MB', 'GB', 'gb', 'Gb']) assert.equal(isValidUnit(u), true, u);
  for (const u of ['TB', 'G', '']) assert.equal(isValidUnit(u), false, u);
});
