'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB là 1024 ** 3', () => { assert.equal(UNITS.GB, 1073741824); });
test('isValidUnit chấp nhận GB không phân biệt hoa thường', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
});
test('isValidUnit vẫn đúng với đơn vị cũ và từ chối TB', () => {
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
});
