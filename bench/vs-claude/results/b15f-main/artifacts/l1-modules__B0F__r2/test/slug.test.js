import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, looseIncludes, sortVi, compareVi, uniqueSlug } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const NFD = (s) => s.normalize('NFD');

test('slugify cơ bản', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
});

test('slugify giới hạn độ dài không cắt giữa từ', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
});

test('fold giữ hoa/thường', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
});

test('so khớp không dấu', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
});

test('sắp xếp theo thanh điệu', () => {
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
});

test('lỗi có mã', () => {
  assert.throws(() => slugify(null), (e) => e.code === 'SLUG_INVALID_INPUT');
});

test('NFD cho kết quả như NFC', () => {
  assert.equal(slugify(NFD('Việt Nam')), 'viet-nam');
  assert.equal(fold(NFD('ệ')), 'e');
  assert.equal(fold(NFD('Đặng')), 'Dang');
  assert.equal(looseEquals(NFD('Đà Nẵng'), 'Đà Nẵng'), true);
  assert.equal(compareVi(NFD('ệ'), 'ệ'), 0);
  assert.equal(fold('ơ'), 'o');
});

test('fold: đ/Đ, giữ hoa thường và ký tự khác', () => {
  assert.equal(fold('đĐ'), 'dD');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Ơ ư ă'), 'O u a');
});

test('slugify: ca biên', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('abc def', { maxLength: 4 }), 'abc');
  assert.equal(slugify('abc def', { maxLength: 100 }), 'abc-def');
});

test('slugify: maxLength sai', () => {
  for (const v of [0, -1, 1.5, '3', NaN, null, Infinity]) {
    assert.throws(() => slugify('abc', { maxLength: v }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
  assert.throws(() => slugify(5, { maxLength: 0 }), code('SLUG_INVALID_INPUT'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-4'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes / looseEquals', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.equal(looseEquals('A\t\nB', 'a b'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.throws(() => looseEquals('a', undefined), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes(1, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi: thứ tự chữ cái', () => {
  assert.equal(compareVi('a', 'ă'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('o', 'ô'), -1);
  assert.equal(compareVi('ô', 'ơ'), -1);
  assert.equal(compareVi('u', 'ư'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', 'a'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('anh', 'an'), 1);
  assert.equal(compareVi('x', 'x'), 0);
});

test('compareVi: mức 1 > mức 2 > mức 3', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('à', 'ả'), -1);
  assert.equal(compareVi('ả', 'ã'), -1);
  assert.equal(compareVi('ã', 'á'), -1);
  assert.equal(compareVi('á', 'ạ'), -1);
  assert.equal(compareVi('ạ', 'a'), 1);
  assert.equal(compareVi('aB', 'Ab'), -1);
  assert.equal(compareVi('ba', 'bà'), -1);
  assert.equal(compareVi('à b', 'a b'), 1);
});

test('sortVi: ví dụ SPEC, ổn định, không đổi đầu vào', () => {
  const cities = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = cities.slice();
  assert.deepEqual(sortVi(cities), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(cities, copy);
  assert.notEqual(sortVi(cities), cities);
  const eq = [NFD('ệ'), 'ệ', NFD('ệ') + ''];
  const r = sortVi(eq);
  assert.equal(r[0], eq[0]);
  assert.equal(r[1], eq[1]);
  assert.deepEqual(sortVi(['b', 'a', 'B', 'A']), ['a', 'A', 'b', 'B']);
});

test('sortVi và compareVi: mã lỗi', () => {
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => compareVi('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => compareVi(undefined, 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => fold(12), code('SLUG_INVALID_INPUT'));
  assert.throws(() => fold(undefined), code('SLUG_INVALID_INPUT'));
});
