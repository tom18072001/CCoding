import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, fold, looseEquals, looseIncludes, sortVi, compareVi, uniqueSlug,
} from '../src/slug/index.js';

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

const codeOf = (c) => (e) => e.code === c;

test('slugify ví dụ spec và NFD', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('Vie\u0302\u0323t'), 'viet');
  assert.equal(slugify('１２'), '');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('', { maxLength: 1 }), '');
  for (const bad of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('', { maxLength: bad }), codeOf('SLUG_INVALID_MAXLENGTH'));
  }
});

test('fold NFC/NFD và đ', () => {
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('e\u0323\u0302'), 'e');
  assert.equal(fold('Đđ ơư ă'), 'Dd ou a');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  assert.throws(() => uniqueSlug('', []), codeOf('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), codeOf('SLUG_INVALID_INPUT'));
});

test('looseIncludes và lỗi kiểu', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
  assert.throws(() => looseEquals(1, 'a'), codeOf('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes('a', undefined), codeOf('SLUG_INVALID_INPUT'));
  assert.throws(() => fold(5), codeOf('SLUG_INVALID_INPUT'));
});

test('compareVi ba mức', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('ệ', 'e\u0323\u0302'), 0);
  assert.equal(compareVi('b', 'a'), 1);
  assert.throws(() => compareVi('a', null), codeOf('SLUG_INVALID_INPUT'));
});

test('sortVi tỉnh thành, ổn định, không sửa đầu vào', () => {
  const src = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...src];
  assert.deepEqual(sortVi(src), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(src, copy);
  assert.deepEqual(sortVi(['a', 'A', 'a']), ['a', 'a', 'A']);
  assert.throws(() => sortVi('x'), codeOf('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), codeOf('SLUG_INVALID_INPUT'));
});
