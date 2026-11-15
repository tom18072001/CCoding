import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, looseIncludes, uniqueSlug, compareVi, sortVi } from '../src/slug/index.js';

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

const code = (c) => (e) => e.code === c;

test('fold: NFC/NFD, đ/Đ, ký tự khác giữ nguyên', () => {
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('Ơ ư Ă đ Đ'), 'O u A d D');
  assert.equal(fold('ệ'.normalize('NFD')), fold('ệ'.normalize('NFC')));
});

test('mọi hàm ném SLUG_INVALID_INPUT với đầu vào sai kiểu', () => {
  for (const bad of [null, undefined, 5, {}, []]) {
    assert.throws(() => fold(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', bad), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});

test('slugify: ví dụ SPEC và ký tự phân cách', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c 日本 d'), 'a-b-c-d');
  assert.equal(slugify('１２３'), '');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('abc', { maxLength: 3 }), 'abc');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  for (const bad of [0, -1, 1.5, '5', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: bad }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-4'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const s = new Set(['abc']);
  uniqueSlug('abc', s);
  assert.equal(s.size, 1);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a'), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.equal(looseEquals('ệ'.normalize('NFD'), 'E'), true);
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
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' a', 'a'), -1);
  assert.equal(compareVi('ệ'.normalize('NFD'), 'ệ'.normalize('NFC')), 0);
  assert.equal(compareVi('ơ', 'ơ'), 0);
  assert.equal(compareVi('x', 'x'), 0);
});

test('sortVi: ví dụ SPEC, ổn định, không sửa đầu vào', () => {
  const cities = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = cities.slice();
  assert.deepEqual(sortVi(cities), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(cities, copy);
  assert.deepEqual(sortVi([]), []);
  const nfc = 'ệ', nfd = 'ệ'.normalize('NFD');
  assert.deepEqual(sortVi([nfd, nfc]), [nfd, nfc]);
  assert.deepEqual(sortVi([nfc, nfd]), [nfc, nfd]);
});
