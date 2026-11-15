'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify trường hợp biên', () => {
  assert.equal(slugify('Đường Điện Biên Phủ'), 'duong-dien-bien-phu');
  assert.equal(slugify('  --Hello,   World!! '), 'hello-world');
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('2024'), '2024');
  assert.equal(slugify(' 12 / 34 '), '12-34');
});

test('uniqueSlugs trường hợp biên', () => {
  assert.deepEqual(uniqueSlugs([]), []);
  assert.deepEqual(uniqueSlugs(['A', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a-2', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'untitled']), ['untitled', 'untitled-2', 'untitled-3']);
});

test('uniqueSlugs không sửa đầu vào, giữ độ dài và thứ tự', () => {
  const input = Object.freeze(['b', 'a', 'b', '', 'a']);
  const out = uniqueSlugs(input);
  assert.deepEqual(input, ['b', 'a', 'b', '', 'a']);
  assert.equal(out.length, input.length);
  assert.deepEqual(out, ['b', 'a', 'b-2', 'untitled', 'a-2']);
});
