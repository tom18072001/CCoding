import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/slug/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };

test('fold / slugify', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('abc 123 !?'), 'abc 123 !?');
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
  assert.equal(code(() => S.slugify('', { maxLength: 0 })), 'SLUG_INVALID_MAXLENGTH');
  assert.equal(code(() => S.slugify(null)), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.fold(5)), 'SLUG_INVALID_INPUT');
});

test('uniqueSlug', () => {
  assert.equal(S.uniqueSlug('abc', []), 'abc');
  assert.equal(S.uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(S.uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  assert.equal(code(() => S.uniqueSlug('', [])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.uniqueSlug('a', 'a')), 'SLUG_INVALID_INPUT');
});

test('looseEquals / looseIncludes', () => {
  assert.equal(S.looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(S.looseIncludes('abc', '  '), true);
  assert.equal(S.looseIncludes('abc', 'd'), false);
});

test('compareVi / sortVi', () => {
  assert.deepEqual(
    S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const lt = (a, b) => assert.equal(S.compareVi(a, b), -1, `${a} < ${b}`);
  lt('A', 'b'); lt('ạ', 'b'); lt('ặ', 'ấ'); lt('a', 'Á'); lt('a', 'A'); lt('an', 'anh'); lt('', 'a');
  lt('1', 'a'); lt(' ', '1'); lt('y', 'f'); lt('f', 'j'); lt('w', 'z'); lt('d', 'đ'); lt('đ', 'e');
  assert.equal(S.compareVi('á', 'A'), 1);
  assert.equal(S.compareVi('ệ', 'ệ'), 0);
  assert.equal(S.compareVi('a', 'ä'), 0);
  const input = ['b', 'a'];
  assert.notEqual(S.sortVi(input), input);
  assert.deepEqual(input, ['b', 'a']);
  assert.equal(code(() => S.sortVi(['a', 1])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.sortVi('a')), 'SLUG_INVALID_INPUT');
});
