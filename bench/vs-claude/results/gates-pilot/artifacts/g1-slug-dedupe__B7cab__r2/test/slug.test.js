'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('uniqueSlugs', () => {
  assert.deepEqual(
    uniqueSlugs(['A', 'a', 'a-2', 'a', '', '!!']),
    ['a', 'a-2', 'a-2-2', 'a-3', 'untitled', 'untitled-2']
  );
  assert.deepEqual(uniqueSlugs([]), []);
});

test('slugify cơ bản', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Đường Hà Nội'), 'duong-ha-noi');
});

test('slugify cắt dấu gạch ở hai đầu', () => {
  assert.equal(slugify('  Hello, World! '), 'hello-world');
});
