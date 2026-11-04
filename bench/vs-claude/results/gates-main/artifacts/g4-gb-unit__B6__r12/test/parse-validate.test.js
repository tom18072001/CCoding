'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => { assert.equal(parseSize('2 GB'), 2 * 1024 ** 3); });
test('parseSize GB thập phân', () => { assert.equal(parseSize('1.5gb'), 1610612736); });
test('parseSize chuỗi sai', () => { assert.throws(() => parseSize('1 TB'), TypeError); });
test('isValidUnit', () => {
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('TB'), false);
});
