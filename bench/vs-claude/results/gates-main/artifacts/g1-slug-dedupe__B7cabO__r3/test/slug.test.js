'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('uniqueSlugs không trùng', () => {
  assert.deepEqual(
    uniqueSlugs(['A', 'a', 'a-2', '!', '', 'a']),
    ['a', 'a-2', 'a-2-2', 'untitled', 'untitled-2', 'a-3']
  );
  assert.equal(slugify('!!!'), '');
});

test('slugify cơ bản', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Đường Hà Nội'), 'duong-ha-noi');
});

test('slugify cắt dấu gạch ở hai đầu', () => {
  assert.equal(slugify('  Hello, World! '), 'hello-world');
});
