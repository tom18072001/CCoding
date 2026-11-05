'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');

test('parseSize hỗ trợ GB', () => {
  assert.strictEqual(parseSize('1GB'), 1073741824);
  assert.strictEqual(parseSize('2 GB'), 2147483648);
});
test('parseSize số thập phân, chữ thường, khoảng trắng', () => {
  assert.strictEqual(parseSize('1.5 gb'), 1610612736);
  assert.strictEqual(parseSize('  1gB  '), 1073741824);
});
test('parseSize đơn vị cũ vẫn đúng', () => {
  assert.strictEqual(parseSize('5B'), 5);
  assert.strictEqual(parseSize('2KB'), 2048);
  assert.strictEqual(parseSize('3 mb'), 3145728);
});
test('parseSize đơn vị không hợp lệ ném TypeError', () => {
  assert.throws(() => parseSize('1TB'), TypeError);
  assert.throws(() => parseSize('abc'), TypeError);
});
