import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi,
} from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

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

test('fold: NFD/NFC, đ, ký tự khác', () => {
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('Đđ ơư ăâ'), 'Dd ou aa');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.throws(() => fold(5), code('SLUG_INVALID_INPUT'));
  assert.throws(() => fold(undefined), code('SLUG_INVALID_INPUT'));
});

test('slugify: ký tự phân cách', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c 日本 d'), 'a-b-c-d');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('１２'), '');
});

test('slugify: maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 2 }), 'ab');
  assert.equal(slugify('ab', { maxLength: 10 }), 'ab');
  for (const bad of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: bad }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const s = new Set(['x']);
  assert.equal(uniqueSlug('x', s), 'x-2');
  assert.equal(s.size, 1);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('A\t\nB', 'a b'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.throws(() => looseEquals('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes(1, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi: ba mức', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' a', 'a'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('ơ', 'p'), -1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('x', 'x'), 0);
  assert.throws(() => compareVi('a', 1), code('SLUG_INVALID_INPUT'));
});

test('sortVi', () => {
  assert.deepEqual(
    sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  const src = ['b', 'a', 'A'];
  assert.deepEqual(sortVi(src), ['a', 'A', 'b']);
  assert.deepEqual(src, ['b', 'a', 'A']);
  const a = 'ệ';
  const b = 'ệ';
  assert.equal(sortVi([a, b])[0], a);
  assert.equal(sortVi([b, a])[0], b);
  assert.throws(() => sortVi('a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
