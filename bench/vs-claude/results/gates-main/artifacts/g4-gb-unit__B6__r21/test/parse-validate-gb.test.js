'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');
const { isValidUnit } = require('../src/validate');

test('parseSize hỗ trợ GB', () => {
  assert.strictEqual(parseSize('1 GB'), 1073741824);
  assert.strictEqual(parseSize('1gb'), 1073741824);
  assert.strictEqual(parseSize('1.5GB'), 1610612736);
});

test('parseSize vẫn ném TypeError với chuỗi sai', () => {
  assert.throws(() => parseSize('1 TB'), TypeError);
  assert.throws(() => parseSize('abc'), TypeError);
});

test('isValidUnit GB', () => {
  assert.strictEqual(isValidUnit('GB'), true);
  assert.strictEqual(isValidUnit('gb'), true);
  assert.strictEqual(isValidUnit('TB'), false);
});
