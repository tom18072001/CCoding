'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify: dấu tiếng Việt và Đ/đ', () => {
  assert.equal(slugify('Đặng Thị Ngọc Ánh'), 'dang-thi-ngoc-anh');
  assert.equal(slugify('đồng hồ'), 'dong-ho');
  assert.equal(slugify('ĐĐ'), 'dd');
});

test('slugify: ký tự đặc biệt liên tiếp thành một dấu gạch', () => {
  assert.equal(slugify('a!!!   ---___b'), 'a-b');
  assert.equal(slugify('--a--'), 'a');
});

test('slugify: rỗng hoặc chỉ ký tự đặc biệt', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('   '), '');
  assert.equal(slugify('!@#$%^&*()'), '');
});

test('uniqueSlugs: rỗng/đặc biệt thành untitled, untitled-2, untitled-3', () => {
  assert.deepEqual(uniqueSlugs(['']), ['untitled']);
  assert.deepEqual(uniqueSlugs(['', '!!!', '   ']), ['untitled', 'untitled-2', 'untitled-3']);
});

test('uniqueSlugs: trùng liên tiếp', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
});

test('uniqueSlugs: trùng với slug của tiêu đề khác', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
});

test('uniqueSlugs: mảng rỗng', () => {
  assert.deepEqual(uniqueSlugs([]), []);
});

test('uniqueSlugs: không thay đổi mảng đầu vào', () => {
  const input = ['A', 'a', ''];
  const copy = [...input];
  const out = uniqueSlugs(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
});

test('uniqueSlugs: hai tiêu đề khác nhau cùng ra một slug', () => {
  assert.deepEqual(uniqueSlugs(['Hello World', 'hello-world']), ['hello-world', 'hello-world-2']);
});
