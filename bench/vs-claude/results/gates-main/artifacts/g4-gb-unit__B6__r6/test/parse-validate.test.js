'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize GB', () => {
  assert.equal(parseSize('2 GB'), 2 * 1024 ** 3);
  assert.equal(parseSize('1.5gb'), 1610612736);
});
test('parseSize giữ hành vi cũ', () => {
  assert.equal(parseSize('1 MB'), 1048576);
  assert.equal(parseSize('10b'), 10);
});
test('parseSize TB ném TypeError', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
});
test('isValidUnit', () => {
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('mb'), true);
  assert.equal(isValidUnit('TB'), false);
});
