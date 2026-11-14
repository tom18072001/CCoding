'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize hỗ trợ GB', () => {
  assert.equal(parseSize('1 GB'), 1073741824);
  assert.equal(parseSize('1.5gb'), 1610612736);
});

test('parseSize giữ hành vi B/KB/MB', () => {
  assert.equal(parseSize('5 B'), 5);
  assert.equal(parseSize('2 KB'), 2048);
  assert.equal(parseSize('1 mb'), 1048576);
});

test('parseSize ném TypeError với chuỗi sai', () => {
  for (const bad of ['1 TB', 'abc']) {
    assert.throws(() => parseSize(bad), (e) => e instanceof TypeError && e.message.startsWith('Kích thước không hợp lệ: '));
  }
});

test('isValidUnit', () => {
  for (const u of ['B', 'KB', 'MB', 'GB', 'gb']) assert.equal(isValidUnit(u), true);
  assert.equal(isValidUnit('TB'), false);
});
