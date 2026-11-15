'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2147483648);
  assert.equal(parseSize('1.5gb'), 1610612736);
  assert.equal(parseSize('1 Gb'), 1024 ** 3);
});

test('parseSize vẫn hỗ trợ MB và từ chối đơn vị lạ', () => {
  assert.equal(parseSize('2 MB'), 2 * 1024 ** 2);
  assert.throws(() => parseSize('1 TB'), TypeError);
});

test('isValidUnit GB', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
});
