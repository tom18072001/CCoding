'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNITS } = require('../src/units');
const { isValidUnit } = require('../src/validate');

test('UNITS.GB === 1073741824', () => { assert.equal(UNITS.GB, 1073741824); });
test('1 GB = 1024 MB', () => { assert.equal(UNITS.GB, 1024 * UNITS.MB); });
test('isValidUnit GB hoa/thường', () => {
  assert.equal(isValidUnit('GB'), true);
  assert.equal(isValidUnit('gb'), true);
});
test('isValidUnit vẫn nhận B/KB/MB', () => {
  for (const u of ['B', 'KB', 'MB', 'mb']) assert.equal(isValidUnit(u), true);
});
test('isValidUnit từ chối đơn vị không hợp lệ', () => {
  for (const u of ['TB', '', 'G', undefined]) assert.equal(isValidUnit(u), false);
});
