'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');
const { formatSize } = require('../src/format');

test('GB cơ bản, có/không khoảng trắng, hoa/thường', () => {
  assert.strictEqual(parseSize('1GB'), 1073741824);
  assert.strictEqual(parseSize('1 GB'), 1073741824);
  assert.strictEqual(parseSize('2gb'), 2147483648);
  assert.strictEqual(parseSize(' 1 Gb '), 1073741824);
});

test('GB thập phân', () => {
  assert.strictEqual(parseSize('1.5 gb'), 1610612736);
  assert.strictEqual(parseSize('0.5GB'), 536870912);
});

test('TB và đơn vị sai vẫn ném TypeError', () => {
  assert.throws(() => parseSize('1TB'), (e) => e instanceof TypeError && e.message.startsWith('Kích thước không hợp lệ: '));
  assert.throws(() => parseSize('GB'), TypeError);
  assert.throws(() => parseSize('1 G'), TypeError);
});

test('B/KB/MB không đổi', () => {
  assert.strictEqual(parseSize('10'.concat('B')), 10);
  assert.strictEqual(parseSize('1KB'), 1024);
  assert.strictEqual(parseSize('1.5 mb'), 1572864);
});

test('round-trip 1 GB với formatSize', () => {
  assert.strictEqual(formatSize(parseSize('1 GB')), '1 GB');
  assert.strictEqual(parseSize(formatSize(1073741824)), 1073741824);
});
