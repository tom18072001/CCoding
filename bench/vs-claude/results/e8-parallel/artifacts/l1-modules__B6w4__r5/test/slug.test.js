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

test('fold: đ/Đ, NFD, ký tự khác giữ nguyên', () => {
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Đđ ơư ăâ'), 'Dd ou aa');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), fold('ệ'));
});

test('slugify: ký tự lạ và ví dụ đặc tả', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２'), '');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  for (const m of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
});

test('compareVi các mức', () => {
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
  assert.equal(compareVi('z', 'w'), 1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
});

test('sortVi tỉnh thành, ổn định, không sửa đầu vào', () => {
  const l = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...l];
  assert.deepEqual(sortVi(l), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(l, copy);
  assert.deepEqual(sortVi(['á', 'á']), ['á', 'á']);
  assert.throws(() => sortVi('x'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});

test('mọi hàm báo lỗi với đầu vào không phải chuỗi', () => {
  for (const v of [undefined, 5]) {
    assert.throws(() => fold(v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(v, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', v), code('SLUG_INVALID_INPUT'));
  }
});
