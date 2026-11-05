import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

test('fold: NFC/NFD, giữ hoa/thường', () => {
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('đ Đ'), 'd D');
  assert.equal(fold('Straße'), 'Straße');
  assert.equal(fold('Ơ ư ă'), 'O u a');
  for (const f of [null, undefined, 5, {}]) assert.throws(() => fold(f), code('SLUG_INVALID_INPUT'));
});

test('slugify', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２'), '');
  assert.equal(slugify('Vị̂t'), 'vit');
  assert.equal(slugify(''), '');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 100 }), 'ab-cd');
  assert.equal(slugify('ab cd', { maxLength: 2 }), 'ab');
  assert.equal(slugify('a b c', { maxLength: 4 }), 'a-b');
  for (const m of [0, -1, 1.5, '5', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
  assert.throws(() => slugify(5), code('SLUG_INVALID_INPUT'));
  assert.equal(slugify('abc', {}), 'abc');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-3'])), 'abc-4');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const s = new Set(['a']);
  uniqueSlug('a', s);
  assert.equal(s.size, 1);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(5, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseEquals('a\tb', 'a  B'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'abcd'), false);
  assert.throws(() => looseEquals('a', 1), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes(null, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('', ''), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ä', 'a'), 0); // dấu lạ
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi('a b', 'ab'), -1);
  assert.equal(compareVi('ơ', 'ô'), 1);
  assert.equal(compareVi('ư', 'u'), 1);
  assert.equal(compareVi('ư', 'v'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('à', 'ả'), -1);
  assert.equal(compareVi('ả', 'ã'), -1);
  assert.equal(compareVi('ã', 'á'), -1);
  assert.equal(compareVi('á', 'ạ'), -1);
  assert.equal(compareVi('aB', 'ab'), 1);
  assert.throws(() => compareVi('a', 1), code('SLUG_INVALID_INPUT'));
});

test('sortVi', () => {
  const provinces = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...provinces];
  assert.deepEqual(sortVi(provinces), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(provinces, copy);
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  // ổn định
  const a = 'ệ';
  assert.deepEqual(sortVi(['ệ', a, 'ệ']), ['ệ', a, 'ệ']);
  assert.deepEqual(sortVi([a, 'ệ']), [a, 'ệ']);
  assert.throws(() => sortVi('x'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
