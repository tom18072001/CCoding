'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('tiêu đề có dấu tiếng Việt, đ/Đ, chữ hoa, dấu tổ hợp', () => {
  assert.equal(slugify('Đặng Thị Ánh Nguyệt'), 'dang-thi-anh-nguyet');
  assert.equal(slugify('ĐỖ ĐÌNH đạt'), 'do-dinh-dat');
  // dấu tổ hợp (NFD): "e" + U+0302 + U+0301
  assert.equal(slugify('Viết Nam'), 'viet-nam');
  assert.equal(slugify('Việt Nam'.normalize('NFC')), 'viet-nam');
});

test('nhiều ký tự đặc biệt liên tiếp cho đúng một dấu gạch', () => {
  assert.equal(slugify('a!!!@@@   ###b'), 'a-b');
  assert.equal(slugify('a - - b'), 'a-b');
});

test('dấu gạch hoặc khoảng trắng ở hai đầu bị cắt', () => {
  assert.equal(slugify('---abc---'), 'abc');
  assert.equal(slugify('   abc   '), 'abc');
  assert.equal(slugify(' - abc - '), 'abc');
});

test('uniqueSlugs: mảng rỗng', () => {
  assert.deepEqual(uniqueSlugs([]), []);
});

test('uniqueSlugs: nhiều tiêu đề rỗng hoặc chỉ ký tự đặc biệt', () => {
  assert.deepEqual(uniqueSlugs(['', '!!!', '   ']), ['untitled', 'untitled-2', 'untitled-3']);
});

test('uniqueSlugs: slug sinh ra trùng tiêu đề khác', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
});

test('uniqueSlugs: đầu vào số hoặc null không ném lỗi', () => {
  assert.doesNotThrow(() => uniqueSlugs([123, null, undefined, 0]));
  assert.equal(uniqueSlugs([123, 123]).length, 2);
  assert.deepEqual(uniqueSlugs([123, 123]), ['123', '123-2']);
  assert.doesNotThrow(() => slugify(null));
});

test('uniqueSlugs: "Untitled" cùng tiêu đề rỗng', () => {
  assert.deepEqual(uniqueSlugs(['Untitled', '']), ['untitled', 'untitled-2']);
  assert.deepEqual(uniqueSlugs(['', 'Untitled']), ['untitled', 'untitled-2']);
});
