'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify rỗng/ký tự đặc biệt', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});

test('uniqueSlugs', () => {
  assert.deepEqual(uniqueSlugs(['A', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'Untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([]), []);
});

test('slugify cơ bản', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Đường Hà Nội'), 'duong-ha-noi');
});

test('slugify cắt dấu gạch ở hai đầu', () => {
  assert.equal(slugify('  Hello, World! '), 'hello-world');
});

test('slugify ca biên', () => {
  assert.equal(slugify('Đường Đ'), 'duong-d');
  assert.equal(slugify('a   b'), 'a-b');
  assert.equal(slugify('--a--'), 'a');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
});

test('uniqueSlugs ca biên', () => {
  assert.deepEqual(uniqueSlugs([]), []);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['', '!!!', 'untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs(['Xin chào', 'xin chao']), ['xin-chao', 'xin-chao-2']);
});
