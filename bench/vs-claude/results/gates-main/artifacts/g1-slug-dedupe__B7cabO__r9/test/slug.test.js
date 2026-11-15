'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify cơ bản', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Đường Hà Nội'), 'duong-ha-noi');
});

test('slugify cắt dấu gạch ở hai đầu', () => {
  assert.equal(slugify('  Hello, World! '), 'hello-world');
});

test('slugify rỗng/ký tự đặc biệt', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});

test('uniqueSlugs thêm hậu tố và xử lý trùng chéo', () => {
  assert.deepEqual(uniqueSlugs(['A', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'Untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([]), []);
});

test('slugify Đ/đ và dấu tổ hợp / dựng sẵn', () => {
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('đ'), 'd');
  assert.equal(slugify('Việt Nam'), 'viet-nam');
  assert.equal(slugify('Việt Nam'), 'viet-nam');
});

test('uniqueSlugs các trường hợp biên', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '?', '---', '']), ['untitled', 'untitled-2', 'untitled-3', 'untitled-4']);
  assert.deepEqual(uniqueSlugs(['', 'untitled', '']), ['untitled', 'untitled-2', 'untitled-3']);
  const input = ['A', 'a'];
  uniqueSlugs(input);
  assert.deepEqual(input, ['A', 'a']);
});
