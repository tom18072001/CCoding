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

test('slugify rỗng / ký tự đặc biệt', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});

test('uniqueSlugs', () => {
  assert.deepEqual(uniqueSlugs(['A', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!', 'Untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([]), []);
});

test('ca biên slugify/uniqueSlugs', () => {
  assert.equal(slugify('Đường Đời'), 'duong-doi');
  assert.equal(slugify('  --A__B  '), 'a-b');
  assert.equal(slugify('Café'), 'cafe');
  assert.equal(slugify(42), '42');
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a-2', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'Đ']), ['untitled', 'untitled-2', 'd']);
  assert.deepEqual(uniqueSlugs([]), []);
});
