import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/slug/index.js';

const code = (fn, c) => assert.throws(fn, (e) => e.code === c);

test('slug: fold/slugify', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('ệ'), 'e');
  assert.equal(S.slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(S.slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(S.slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(S.slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(S.slugify('Straße'), 'stra-e');
  assert.equal(S.slugify('日本'), '');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(S.slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(S.slugify('', {}), '');
  for (const m of [0, 1.5, '3', null, NaN]) code(() => S.slugify('', { maxLength: m }), 'SLUG_INVALID_MAXLENGTH');
  for (const x of [null, undefined, 5]) code(() => S.slugify(x), 'SLUG_INVALID_INPUT');
});

test('slug: uniqueSlug, loose', () => {
  assert.equal(S.uniqueSlug('abc', []), 'abc');
  assert.equal(S.uniqueSlug('abc', new Set(['abc', 'abc-2'])), 'abc-3');
  assert.equal(S.uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  code(() => S.uniqueSlug('', []), 'SLUG_INVALID_INPUT');
  code(() => S.uniqueSlug('a', 'a'), 'SLUG_INVALID_INPUT');
  assert.equal(S.looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(S.looseEquals('a', 'b'), false);
  assert.equal(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(S.looseIncludes('abc', '  '), true);
  code(() => S.looseEquals('a', 1), 'SLUG_INVALID_INPUT');
});

test('slug: compareVi / sortVi', () => {
  const c = S.compareVi;
  assert.equal(c('A', 'b'), -1);
  assert.equal(c('ạ', 'b'), -1);
  assert.equal(c('ặ', 'ấ'), -1);
  assert.equal(c('a', 'Á'), -1);
  assert.equal(c('á', 'A'), 1);
  assert.equal(c('a', 'A'), -1);
  assert.equal(c('an', 'anh'), -1);
  assert.equal(c('', 'a'), -1);
  assert.equal(c('1', 'a'), -1);
  assert.equal(c('y', 'f'), -1);
  assert.equal(c('z', 'w'), 1);
  assert.equal(c('đ', 'd'), 1);
  assert.equal(c('đ', 'e'), -1);
  assert.equal(c('ệ', 'ệ'), 0);
  assert.equal(c('ơ', 'ơ'), 0);
  assert.equal(c('ơ', 'ô'), 1);
  assert.deepEqual(S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const src = ['b', 'a'];
  assert.notEqual(S.sortVi(src), src);
  assert.deepEqual(src, ['b', 'a']);
  code(() => S.sortVi('x'), 'SLUG_INVALID_INPUT');
  code(() => S.sortVi(['x', 1]), 'SLUG_INVALID_INPUT');
});
