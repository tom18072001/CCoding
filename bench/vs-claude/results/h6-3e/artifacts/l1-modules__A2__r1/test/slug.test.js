import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi } from '../src/slug/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('fold', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ươ'), 'uo');
  throwsCode(() => fold(null), 'SLUG_INVALID_INPUT');
});

test('slugify', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  throwsCode(() => slugify('', { maxLength: 0 }), 'SLUG_INVALID_MAXLENGTH');
  throwsCode(() => slugify('a', { maxLength: 1.5 }), 'SLUG_INVALID_MAXLENGTH');
  throwsCode(() => slugify(5), 'SLUG_INVALID_INPUT');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  throwsCode(() => uniqueSlug('', []), 'SLUG_INVALID_INPUT');
  throwsCode(() => uniqueSlug('a', 'x'), 'SLUG_INVALID_INPUT');
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
  throwsCode(() => looseEquals('a', 1), 'SLUG_INVALID_INPUT');
});

test('compareVi / sortVi', () => {
  assert.deepEqual(sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const lt = (a, b) => { assert.equal(compareVi(a, b), -1, `${a}<${b}`); assert.equal(compareVi(b, a), 1); };
  lt('A', 'b'); lt('ạ', 'b'); lt('ặ', 'ấ'); lt('a', 'Á'); lt('a', 'A'); lt('an', 'anh'); lt('', 'a');
  lt('1', 'a'); lt('a b', 'ab'); lt('y', 'f'); lt('f', 'j'); lt('w', 'z'); lt('d', 'đ'); lt('ơ', 'p');
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('x', 'x'), 0);
  const src = ['b', 'B', 'b'];
  assert.deepEqual(sortVi(src), ['b', 'b', 'B']);
  assert.deepEqual(src, ['b', 'B', 'b']);
  throwsCode(() => sortVi([1]), 'SLUG_INVALID_INPUT');
  throwsCode(() => sortVi('a'), 'SLUG_INVALID_INPUT');
});
