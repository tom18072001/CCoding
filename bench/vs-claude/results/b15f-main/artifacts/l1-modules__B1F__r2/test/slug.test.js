import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi } from '../src/slug/index.js';

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

test('NFD và NFC cho kết quả như nhau', () => {
  const nfc = 'Việt Nam Đẹp'.normalize('NFC');
  const nfd = nfc.normalize('NFD');
  assert.equal(slugify(nfd), 'viet-nam-dep');
  assert.equal(fold(nfd), 'Viet Nam Dep');
  assert.equal(compareVi(nfc, nfd), 0);
  assert.equal(looseEquals(nfc, nfd), true);
});

test('slugify biên', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ___ 日本'), '');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.throws(() => slugify('', { maxLength: 0 }), (e) => e.code === 'SLUG_INVALID_MAXLENGTH');
  assert.throws(() => slugify('a', { maxLength: 1.5 }), (e) => e.code === 'SLUG_INVALID_MAXLENGTH');
  assert.throws(() => slugify('a', { maxLength: '3' }), (e) => e.code === 'SLUG_INVALID_MAXLENGTH');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  assert.throws(() => uniqueSlug('', []), (e) => e.code === 'SLUG_INVALID_INPUT');
  assert.throws(() => uniqueSlug('a', 'a'), (e) => e.code === 'SLUG_INVALID_INPUT');
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
});

test('compareVi thứ tự chi tiết', () => {
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
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('o', 'ô'), -1);
  assert.equal(compareVi('ô', 'ơ'), -1);
  assert.equal(compareVi('u', 'ư'), -1);
  assert.equal(compareVi('x', 'x'), 0);
});

test('sortVi', () => {
  const src = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...src];
  assert.deepEqual(sortVi(src), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(src, copy);
  assert.throws(() => sortVi('x'), (e) => e.code === 'SLUG_INVALID_INPUT');
  assert.throws(() => sortVi(['a', 1]), (e) => e.code === 'SLUG_INVALID_INPUT');
});

test('mọi hàm báo SLUG_INVALID_INPUT với kiểu sai', () => {
  for (const bad of [null, undefined, 5]) {
    for (const f of [fold, slugify, (x) => looseEquals(x, 'a'), (x) => looseIncludes('a', x), (x) => compareVi(x, 'a')]) {
      assert.throws(() => f(bad), (e) => e.code === 'SLUG_INVALID_INPUT');
    }
  }
});
