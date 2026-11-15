'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify: tiếng Việt có dấu và đ/Đ', () => {
  assert.equal(slugify('Đường Đồ Đạc'), 'duong-do-dac');
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('đ'), 'd');
});

test('slugify: ký tự đặc biệt liên tiếp thành một dấu gạch', () => {
  assert.equal(slugify('a !!!@@@ b'), 'a-b');
  assert.equal(slugify('a---b'), 'a-b');
});

test('slugify: rỗng, chỉ ký tự đặc biệt, gạch ở hai đầu, chữ số', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('-a-'), 'a');
  assert.equal(slugify('Top 10 năm 2024'), 'top-10-nam-2024');
});

test('uniqueSlugs: mảng rỗng', () => {
  assert.deepEqual(uniqueSlugs([]), []);
});

test('uniqueSlugs: slug rỗng thành untitled có hậu tố', () => {
  assert.deepEqual(uniqueSlugs(['', '', '!!!']), ['untitled', 'untitled-2', 'untitled-3']);
});

test('uniqueSlugs: hậu tố không đụng slug đã dùng', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2', 'a']), ['a', 'a-2', 'a-2-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
});

test('uniqueSlugs: tiêu đề khác nhau cùng slug', () => {
  assert.deepEqual(uniqueSlugs(['Xin Chào', 'xin chao']), ['xin-chao', 'xin-chao-2']);
});

test('uniqueSlugs: 1000 phần tử trùng chạy nhanh, kết quả duy nhất', () => {
  const t0 = Date.now();
  const out = uniqueSlugs(Array(1000).fill('x'));
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(out.length, 1000);
  assert.equal(new Set(out).size, 1000);
  assert.equal(out[0], 'x');
  assert.equal(out[999], 'x-1000');
});
