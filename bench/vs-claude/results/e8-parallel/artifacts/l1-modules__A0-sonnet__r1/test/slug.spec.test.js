import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/slug/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('fold và slugify', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(S.fold('ệ'), 'e');
  assert.equal(S.slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(S.slugify('Xin chào Việt Nam'.normalize('NFD')), 'xin-chao-viet-nam');
  assert.equal(S.slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(S.slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(S.slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(S.slugify('Straße'), 'stra-e');
  assert.equal(S.slugify('日本'), '');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(S.slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(code(() => S.slugify('', { maxLength: 0 })), 'SLUG_INVALID_MAXLENGTH');
  assert.equal(code(() => S.slugify('a', { maxLength: 1.5 })), 'SLUG_INVALID_MAXLENGTH');
  for (const v of [null, undefined, 5]) assert.equal(code(() => S.slugify(v)), 'SLUG_INVALID_INPUT');
});

test('uniqueSlug', () => {
  assert.equal(S.uniqueSlug('abc', []), 'abc');
  assert.equal(S.uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(S.uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  assert.equal(code(() => S.uniqueSlug('', [])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.uniqueSlug('a', 'x')), 'SLUG_INVALID_INPUT');
});

test('looseEquals/looseIncludes', () => {
  assert.ok(S.looseEquals('Đà   Nẵng ', 'da nang'));
  assert.ok(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'));
  assert.ok(S.looseIncludes('abc', '  '));
  assert.equal(S.looseEquals('a', 'b'), false);
});

test('compareVi và sortVi', () => {
  const c = S.compareVi;
  assert.equal(c('an', 'anh'), -1);
  assert.equal(c('', 'a'), -1);
  assert.equal(c('A', 'b'), -1);
  assert.equal(c('ạ', 'b'), -1);
  assert.equal(c('ặ', 'ấ'), -1);
  assert.equal(c('a', 'Á'), -1);
  assert.equal(c('á', 'A'), 1);
  assert.equal(c('a', 'A'), -1);
  assert.equal(c('y', 'f'), -1);
  assert.equal(c('z', 'w'), 1);
  assert.equal(c('1', 'a'), -1);
  assert.equal(c('ệ', 'ệ'.normalize('NFD')), 0);
  assert.equal(c('d', 'đ'), -1);
  assert.equal(c('đ', 'e'), -1);
  assert.deepEqual(S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  assert.equal(code(() => S.sortVi('x')), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.sortVi(['a', 1])), 'SLUG_INVALID_INPUT');
});
