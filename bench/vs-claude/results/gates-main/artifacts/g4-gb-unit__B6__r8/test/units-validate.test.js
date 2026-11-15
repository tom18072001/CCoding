'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB = 1024 MB', () => {
  assert.equal(UNITS.GB, UNITS.MB * 1024);
  assert.equal(UNITS.GB, 1073741824);
});
test('isValidUnit chấp nhận GB (không phân biệt hoa/thường)', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('Gb'), true);
});
test('isValidUnit vẫn đúng với đơn vị cũ và từ chối đơn vị lạ', () => {
  assert.equal(isValidUnit('MB'), true);
  assert.equal(isValidUnit('TB'), false);
  assert.equal(isValidUnit(''), false);
});
