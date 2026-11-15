'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify: Đ/đ → d', () => {
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('đ'), 'd');
  assert.equal(slugify('Đồng Đen'), 'dong-den');
});

test('slugify: dấu hoa/thường', () => {
  assert.equal(slugify('ƯƠNG Ế'), 'uong-e');
  assert.equal(slugify('ương ế'), 'uong-e');
});

test('slugify: NFD và NFC cho cùng kết quả', () => {
  const nfc = 'Việt Nam Đẹp'.normalize('NFC');
  const nfd = 'Việt Nam Đẹp'.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(slugify(nfc), 'viet-nam-dep');
  assert.equal(slugify(nfd), 'viet-nam-dep');
});

test('slugify: ký tự đặc biệt liên tiếp thành một dấu -', () => {
  assert.equal(slugify('a!!!@@@   ---b'), 'a-b');
  assert.equal(slugify('--a--'), 'a');
});

test('slugify: số và chữ lẫn lộn', () => {
  assert.equal(slugify('Abc 123 x9Y'), 'abc-123-x9y');
});

test('slugify: null/undefined/số/chỉ khoảng trắng', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
  assert.equal(slugify('   \t\n '), '');
});

test('uniqueSlugs: trùng với hậu tố của tiêu đề khác', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
});

test('uniqueSlugs: untitled', () => {
  assert.deepEqual(uniqueSlugs(['', '', '']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs(['Untitled', '']), ['untitled', 'untitled-2']);
});

test('uniqueSlugs: mảng rỗng', () => {
  assert.deepEqual(uniqueSlugs([]), []);
});

test('uniqueSlugs: 1000 phần tử trùng chạy nhanh và khác nhau', () => {
  const input = Array.from({ length: 1000 }, () => 'same');
  const t0 = Date.now();
  const out = uniqueSlugs(input);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(out.length, 1000);
  assert.equal(new Set(out).size, 1000);
});

test('uniqueSlugs: độ dài, thứ tự, không đổi đầu vào', () => {
  const input = ['B', 'a', 'B', 'c'];
  const copy = input.slice();
  const out = uniqueSlugs(input);
  assert.deepEqual(input, copy);
  assert.deepEqual(out, ['b', 'a', 'b-2', 'c']);
});
