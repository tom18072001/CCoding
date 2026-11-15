import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

test('fold', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(S.fold('ệ'), 'e');
  assert.equal(S.fold('ệ'), 'e');
  assert.equal(S.fold('đ'), 'd');
  assert.equal(S.fold('ơư'), 'ou');
});

test('slugify', () => {
  assert.equal(S.slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(S.slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(S.slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(S.slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(S.slugify('Straße'), 'stra-e');
  assert.equal(S.slugify('日本'), '');
  assert.equal(S.slugify('a_b.c'), 'a-b-c');
  assert.equal(S.slugify('１２３'), '');
  assert.equal(S.slugify('Vị̂et'), 'viet');
});

test('slugify maxLength', () => {
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(S.slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(S.slugify('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(S.slugify('ab', { maxLength: 10 }), 'ab');
  for (const m of [0, -1, 1.5, '3', null, NaN]) {
    assert.throws(() => S.slugify('', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => S.slugify(5), code('SLUG_INVALID_INPUT'));
  assert.throws(() => S.slugify(null, { maxLength: 0 }), code('SLUG_INVALID_INPUT'));
});

test('uniqueSlug', () => {
  assert.equal(S.uniqueSlug('abc', []), 'abc');
  assert.equal(S.uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(S.uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-3'])), 'abc-4');
  assert.equal(S.uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const arr = ['abc'];
  S.uniqueSlug('abc', arr);
  assert.deepEqual(arr, ['abc']);
  assert.throws(() => S.uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => S.uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => S.uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(S.looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(S.looseEquals('a', 'b'), false);
  assert.equal(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(S.looseIncludes('abc', '   '), true);
  assert.equal(S.looseIncludes('abc', 'abd'), false);
  assert.throws(() => S.looseEquals('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => S.looseIncludes(undefined, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi', () => {
  const c = S.compareVi;
  assert.equal(c('an', 'anh'), -1);
  assert.equal(c('', 'a'), -1);
  assert.equal(c('A', 'b'), -1);
  assert.equal(c('ạ', 'b'), -1);
  assert.equal(c('ặ', 'ấ'), -1);
  assert.equal(c('a', 'A'), -1);
  assert.equal(c('a', 'Á'), -1);
  assert.equal(c('á', 'A'), 1);
  assert.equal(c('ệ', 'ệ'), 0);
  assert.equal(c('x', 'x'), 0);
  assert.equal(c('d', 'đ'), -1);
  assert.equal(c('đ', 'e'), -1);
  assert.equal(c('y', 'f'), -1);
  assert.equal(c('f', 'j'), -1);
  assert.equal(c('w', 'z'), -1);
  assert.equal(c('1', 'a'), -1);
  assert.equal(c(' a', 'a'), -1);
  assert.equal(c('o', 'ô'), -1);
  assert.equal(c('ô', 'ơ'), -1);
  assert.equal(c('u', 'ư'), -1);
  assert.equal(c('ư', 'v'), -1);
  assert.equal(c('a̐', 'a'), 0);
  assert.throws(() => c('a', 1), code('SLUG_INVALID_INPUT'));
});

test('sortVi', () => {
  assert.deepEqual(
    S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const input = ['b', 'a'];
  assert.notEqual(S.sortVi(input), input);
  assert.deepEqual(input, ['b', 'a']);
  // ổn định: NFC và NFD bằng nhau giữ thứ tự gốc
  assert.deepEqual(S.sortVi(['ệ', 'ệ']), ['ệ', 'ệ']);
  assert.throws(() => S.sortVi('x'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => S.sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
