'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, uniqueSlugs } = require('../src/slug');

test('slugify: null/undefined/rỗng/ký tự đặc biệt → ""', () => {
  for (const v of [null, undefined, '', '   ', '!@#$%^&*()', '---', '___ ...']) {
    assert.equal(slugify(v), '');
  }
});

test('slugify: đ/Đ → d', () => {
  assert.equal(slugify('đ'), 'd');
  assert.equal(slugify('Đ'), 'd');
  assert.equal(slugify('Đồng đều'), 'dong-deu');
});

test('slugify: dấu tiếng Việt dựng sẵn và tổ hợp', () => {
  assert.equal(slugify('Tiếng Việt'), 'tieng-viet');
  assert.equal(slugify('Tiếng Việt'), 'tieng-viet');
  assert.equal(slugify('ƠƯ ơư ặẳẵ'), 'ou-ou-aaa');
});

test('slugify: số, phân cách liên tiếp, không có - ở đầu/cuối', () => {
  assert.equal(slugify('Chapter 10: Part 2'), 'chapter-10-part-2');
  assert.equal(slugify('a  --  __ b'), 'a-b');
  assert.equal(slugify('--a--'), 'a');
  assert.equal(slugify('  !!a!!b!!  '), 'a-b');
  assert.equal(slugify('2024'), '2024');
});

test('uniqueSlugs: các ca biên', () => {
  assert.deepEqual(uniqueSlugs([]), []);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a']), ['a', 'a-2', 'a-3']);
  assert.deepEqual(uniqueSlugs(['', '!!', 'untitled']), ['untitled', 'untitled-2', 'untitled-3']);
  assert.deepEqual(uniqueSlugs(['a', 'a', 'a-2']), ['a', 'a-2', 'a-2-2']);
  assert.deepEqual(uniqueSlugs(['A', 'a', 'Á']), ['a', 'a-2', 'a-3']);
});

test('uniqueSlugs: nhận iterable', () => {
  assert.deepEqual(uniqueSlugs(new Set(['x', 'X!', 'y'])), ['x', 'x-2', 'y']);
  assert.deepEqual(uniqueSlugs(['p', 'p'].values()), ['p', 'p-2']);
  function* gen() { yield 'g'; yield 'G'; }
  assert.deepEqual(uniqueSlugs(gen()), ['g', 'g-2']);
});

test('uniqueSlugs: cùng độ dài, đúng thứ tự, không trùng', () => {
  const titles = ['b', 'a', 'b', '', 'a-2', 'a', '!', 'B', 'a-2'];
  const out = uniqueSlugs(titles);
  assert.equal(out.length, titles.length);
  assert.equal(new Set(out).size, out.length);
  assert.deepEqual(out, ['b', 'a', 'b-2', 'untitled', 'a-2', 'a-3', 'untitled-2', 'b-3', 'a-2-2']);
});
