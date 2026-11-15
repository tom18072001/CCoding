'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify cơ bản', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Đường Hà Nội'), 'duong-ha-noi');
});

test('uniqueSlugs', () => {
  assert.deepEqual(uniqueSlugs(['A', 'a', 'A!']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'Untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([]), []);
});

test('slugify cắt dấu gạch ở hai đầu', () => {
  assert.equal(slugify('  Hello, World! '), 'hello-world');
});

test('slugify ca biên', () => {
  assert.equal(slugify('đ Đ'), 'd-d');
  assert.equal(slugify('é ạ'), 'e-a');
  assert.equal(slugify('!@# $%^'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
});

test('uniqueSlugs ca biên', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '', '', '']), ['untitled', 'untitled-2', 'untitled-3', 'untitled-4']);
  assert.deepEqual(uniqueSlugs(['Untitled', '']), ['untitled', 'untitled-2']);
  const input = ['A', 'a', ''];
  const copy = [...input];
  uniqueSlugs(input);
  assert.deepEqual(input, copy);
});
