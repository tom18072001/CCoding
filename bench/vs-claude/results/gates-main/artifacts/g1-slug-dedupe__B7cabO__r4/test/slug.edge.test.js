'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify: null/undefined/số', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
  assert.equal(slugify(0), '0');
});

test('slugify: rỗng và chỉ ký tự đặc biệt', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('   '), '');
  assert.equal(slugify('!@#$%^&*()'), '');
  assert.equal(slugify('---'), '');
});

test('slugify: đ/Đ → d', () => {
  assert.equal(slugify('đ'), 'd');
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('Đồng đều'), 'dong-deu');
});

test('slugify: dấu dựng sẵn và dạng tổ hợp cho kết quả như nhau', () => {
  const precomposed = 'Tiếng Việt Xin chào';
  const decomposed = precomposed.normalize('NFD');
  assert.notEqual(precomposed, decomposed);
  assert.equal(slugify(precomposed), 'tieng-viet-xin-chao');
  assert.equal(slugify(decomposed), 'tieng-viet-xin-chao');
  assert.equal(slugify('â'), 'a');
});

test('slugify: ký tự đặc biệt liên tiếp thành một dấu gạch', () => {
  assert.equal(slugify('a!!!  ---??b'), 'a-b');
  assert.equal(slugify('a_b.c/d'), 'a-b-c-d');
});

test('slugify: không có dấu gạch ở đầu/cuối', () => {
  assert.equal(slugify('--Hello--'), 'hello');
  assert.equal(slugify('  !x! '), 'x');
});

test('slugify: giữ nguyên chữ số', () => {
  assert.equal(slugify('Bài 10 năm 2024'), 'bai-10-nam-2024');
  assert.equal(slugify('007'), '007');
});

test('uniqueSlugs: mảng rỗng', () => {
  assert.deepEqual(uniqueSlugs([]), []);
});

test('uniqueSlugs: tất cả tiêu đề rỗng', () => {
  assert.deepEqual(uniqueSlugs(['', '', '']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs([null, undefined, '!!']), ['untitled', 'untitled-2', 'untitled-3']);
});

test('uniqueSlugs: hậu tố va chạm với slug đã có', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
});

test('uniqueSlugs: tiêu đề khác nhau nhưng cùng slug', () => {
  assert.deepEqual(uniqueSlugs(['Xin chào', 'xin-chao']), ['xin-chao', 'xin-chao-2']);
});

test('uniqueSlugs: giữ thứ tự, độ dài và không sửa đầu vào', () => {
  const input = ['B', 'A', 'B', 'A', 'C'];
  const copy = input.slice();
  const out = uniqueSlugs(input);
  assert.equal(out.length, input.length);
  assert.deepEqual(out, ['b', 'a', 'b-2', 'a-2', 'c']);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
});
