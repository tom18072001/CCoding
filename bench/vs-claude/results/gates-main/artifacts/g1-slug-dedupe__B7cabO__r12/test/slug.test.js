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

test('slugify ca biên', () => {
  assert.equal(slugify('Đ đ'), 'd-d');
  assert.equal(slugify('Đồng Tiến Ướt Ở'), 'dong-tien-uot-o');
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
  assert.equal(slugify('a!!!  ---@@b'), 'a-b');
  assert.equal(slugify('Top 10 năm 2024'), 'top-10-nam-2024');
});

test('uniqueSlugs ca biên', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!!']), ['untitled', 'untitled-2']);
  assert.deepEqual(uniqueSlugs(['untitled', '']), ['untitled', 'untitled-2']);
  const out = uniqueSlugs(['x', 'y', 'x', 'Đ', 'd']);
  assert.equal(out.length, 5);
  assert.deepEqual(out, ['x', 'y', 'x-2', 'd', 'd-2']);
});

test('uniqueSlugs', () => {
  assert.deepEqual(uniqueSlugs(['A', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'Untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([]), []);
});
