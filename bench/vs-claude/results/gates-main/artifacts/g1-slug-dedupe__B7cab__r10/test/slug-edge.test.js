'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('đ/Đ hoa và thường', () => {
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('đ'), 'd');
  assert.equal(slugify('ĐÀ NẴNG đẹp'), 'da-nang-dep');
});

test('dấu tiếng Việt NFC và NFD cho cùng kết quả', () => {
  const s = 'Tiếng Việt Ướt Ơ Ă Â Ê Ô Ư';
  assert.equal(slugify(s.normalize('NFC')), 'tieng-viet-uot-o-a-a-e-o-u');
  assert.equal(slugify(s.normalize('NFD')), 'tieng-viet-uot-o-a-a-e-o-u');
  assert.equal(slugify('đễ'.normalize('NFD')), 'de');
});

test('nhiều ký tự đặc biệt liên tiếp thành một dấu -', () => {
  assert.equal(slugify('a!!!   ---___b'), 'a-b');
  assert.equal(slugify('--a--b--'), 'a-b');
  assert.equal(slugify('a@#$%^&*()b'), 'a-b');
});

test('chuỗi rỗng hoặc chỉ ký tự đặc biệt → ""', () => {
  for (const s of ['', ' ', '\t\n', '!@#', '---', '___', '😀']) {
    assert.equal(slugify(s), '');
  }
});

test('null/undefined/số', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
  assert.equal(slugify(0), '0');
  assert.equal(slugify(-1.5), '1-5');
});

test('uniqueSlugs: trùng với slug của tiêu đề khác', () => {
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['a-2', 'a', 'a']), ['a-2', 'a', 'a-3']);
});

test('uniqueSlugs: rỗng → untitled', () => {
  assert.deepEqual(uniqueSlugs(['', '', ' ']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs(['!!', 'untitled']), ['untitled', 'untitled-2']);
  assert.deepEqual(uniqueSlugs(['untitled', '!!']), ['untitled', 'untitled-2']);
});

test('uniqueSlugs: mảng rỗng và giữ thứ tự/độ dài', () => {
  assert.deepEqual(uniqueSlugs([]), []);
  const out = uniqueSlugs(['B', 'A', 'B', 'C', 'A']);
  assert.deepEqual(out, ['b', 'a', 'b-2', 'c', 'a-2']);
  assert.equal(out.length, 5);
});

test('uniqueSlugs: không đổi mảng đầu vào', () => {
  const input = ['A', 'a'];
  uniqueSlugs(input);
  assert.deepEqual(input, ['A', 'a']);
});
