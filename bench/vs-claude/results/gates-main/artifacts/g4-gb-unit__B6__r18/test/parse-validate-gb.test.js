'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => {
  assert.equal(parseSize('1 GB'), 1073741824);
  assert.equal(parseSize('1.5gb'), 1610612736);
  assert.equal(parseSize('2Gb'), 2147483648);
});

test('parseSize vẫn hỗ trợ MB và báo lỗi đơn vị sai', () => {
  assert.equal(parseSize('1 MB'), 1048576);
  assert.throws(() => parseSize('1 TB'), { name: 'TypeError', message: 'Kích thước không hợp lệ: 1 TB' });
});

test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
});
