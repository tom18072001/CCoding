import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

test('fold: đ/Đ, NFD, ký tự khác giữ nguyên', () => {
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('đĐ'), 'dD');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ƠƯ ơư ăâ'), 'OU ou aa');
  assert.equal(fold('Đặng'.normalize('NFD')), 'Dang');
  assert.throws(() => fold(undefined), code('SLUG_INVALID_INPUT'));
});

test('slugify: ký tự lạ là phân cách, NFD', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c日本d'), 'a-b-c-d');
  assert.equal(slugify('ａ１'), '');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('Việt'.normalize('NFD')), 'viet');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(slugify('abc', { maxLength: 3 }), 'abc');
});

test('slugify lỗi maxLength, kể cả text rỗng', () => {
  for (const m of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify(5), code('SLUG_INVALID_INPUT'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-3'])), 'abc-4');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(null, []), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
  assert.throws(() => looseEquals(1, 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes('a', undefined), code('SLUG_INVALID_INPUT'));
});

test('compareVi: mức 1 chữ cái gốc a/ă/â, d/đ', () => {
  assert.equal(compareVi('a', 'ă'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('â', 'b'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
});

test('compareVi: mức 2 thanh điệu và mức 3 hoa/thường', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('a', 'a'), 0);
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i < 5; i++) assert.equal(compareVi(tones[i], tones[i + 1]), -1);
});

test('compareVi: NFC = NFD, kết quả -1/0/1', () => {
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ứ', 'ứ'), 0);
  assert.equal(compareVi('b', 'a'), 1);
  assert.throws(() => compareVi('a', null), code('SLUG_INVALID_INPUT'));
});

test('sortVi: ví dụ spec, ổn định, không sửa đầu vào', () => {
  const cities = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...cities];
  const r = sortVi(cities);
  assert.deepEqual(r, ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.notEqual(r, cities);
  assert.deepEqual(cities, copy);
  const a = 'ệ', b = 'ệ';
  assert.deepEqual(sortVi([b, a]), [b, a]);
  assert.deepEqual(sortVi([a, b]), [a, b]);
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});

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
