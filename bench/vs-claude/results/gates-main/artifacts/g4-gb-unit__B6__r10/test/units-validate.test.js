'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB', () => {
  assert.equal(UNITS.GB, 1073741824);
  assert.equal(UNITS.GB, 1024 * UNITS.MB);
});

test('isValidUnit chấp nhận GB/gb', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
  assert.equal(isValidUnit('MB'), true);
});

test('isValidUnit từ chối TB và rỗng', () => {
  assert.equal(isValidUnit('TB'), false);
  assert.equal(isValidUnit(''), false);
});
