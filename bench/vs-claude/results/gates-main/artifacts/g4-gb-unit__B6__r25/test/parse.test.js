'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSize } = require('../src/parse');
const { formatSize } = require('../src/format');

test('parseSize GB', () => {
  assert.strictEqual(parseSize('1GB'), 1073741824);
  assert.strictEqual(parseSize('1 GB'), 1073741824);
  assert.strictEqual(parseSize('1.5 gb'), 1610612736);
  assert.strictEqual(parseSize('2Gb'), 2 * 1024 ** 3);
  assert.strictEqual(parseSize(' 1gB '), 1024 ** 3);
});

test('parseSize đơn vị cũ vẫn đúng', () => {
  assert.strictEqual(parseSize('5B'), 5);
  assert.strictEqual(parseSize('2 kb'), 2048);
  assert.strictEqual(parseSize('1MB'), 1048576);
});

test('parseSize đơn vị sai ném TypeError', () => {
  for (const s of ['1TB', 'GB', '', '1 G', '-1GB']) {
    assert.throws(() => parseSize(s), (e) => e instanceof TypeError && e.message === 'Kích thước không hợp lệ: ' + s);
  }
});

test('parseSize khớp ngược formatSize', () => {
  for (const b of [1, 1024, 1048576, 1073741824, 1610612736, 5 * 1024 ** 3]) {
    assert.strictEqual(parseSize(formatSize(b)), b);
  }
});
