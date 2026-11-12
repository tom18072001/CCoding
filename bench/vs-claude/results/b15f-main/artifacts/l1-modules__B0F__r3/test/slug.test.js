import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, sortVi } from '../src/slug/index.js';
import { looseIncludes, uniqueSlug, compareVi } from '../src/slug/index.js';

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

test('fold: NFD/NFC, đ/Đ, giữ hoa thường và ký tự khác', () => {
  assert.equal(fold('e\u0323\u0302'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('đĐ ơƯ ăÂ'), 'dD oU aA');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Việt'.normalize('NFD')), 'Viet');
  assert.equal(fold(''), '');
});

test('slugify: ký tự đặc biệt và phân cách', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本 go'), 'go');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２ ab'), 'ab');
  assert.equal(slugify('---'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify('Việt'.normalize('NFD')), 'viet');
  assert.equal(slugify('Đ'), 'd');
});

test('slugify: maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('xin chao viet nam', { maxLength: 100 }), 'xin-chao-viet-nam');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 1 }), 'a');
  assert.equal(slugify('ab cd', { maxLength: 2 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(slugify('a b c', {}), 'a-b-c');
  for (const bad of [0, -1, 1.5, '3', NaN, Infinity, null]) {
    assert.throws(() => slugify('abc', { maxLength: bad }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2', 'abc-3']), 'abc-4');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-3'])), 'abc-2');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(5, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('Hà Nội', 'Ha Noi!'), false);
  assert.equal(looseEquals('Ệ', 'ệ'.normalize('NFD')), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'chi  ho'), false);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', ''), true);
  assert.throws(() => looseEquals('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes(1, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi: chữ cái, đ sau d, ăâ', () => {
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('dz', 'đa'), -1);
  assert.equal(compareVi('a', 'ă'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('', ''), 0);
  assert.equal(compareVi('anh', 'an'), 1);
});

test('compareVi: thanh điệu và hoa/thường', () => {
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('ab', 'aB'), -1);
  assert.equal(compareVi('aB', 'Ab'), -1); // vị trí khác nhau đầu tiên: a < A
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i < tones.length - 1; i++) {
    assert.equal(compareVi(tones[i], tones[i + 1]), -1);
    assert.equal(compareVi(tones[i + 1], tones[i]), 1);
  }
  assert.equal(compareVi('ầ', 'ẩ'), -1);
  assert.equal(compareVi('ệ', 'ệ'.normalize('NFD')), 0);
  assert.equal(compareVi('ệ'.normalize('NFD'), 'ẹ'), 1); // ê > e
  assert.equal(compareVi('e\u0302\u0323', 'e\u0323\u0302'), 0);
  assert.equal(compareVi('a\u0308', 'a'), 0); // dấu lạ bị bỏ qua
});

test('sortVi: ví dụ SPEC, ổn định, không đổi đầu vào', () => {
  const input = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = input.slice();
  const out = sortVi(input);
  assert.deepEqual(out, ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  const a = 'ệ', b = 'ệ'.normalize('NFD');
  assert.deepEqual(sortVi([b, a]), [b, a]);
  assert.deepEqual(sortVi([a, b]), [a, b]);
  assert.deepEqual(sortVi([]), []);
  assert.deepEqual(sortVi(['b', 'A', 'a', '1']), ['1', 'a', 'A', 'b']);
});

test('mã lỗi SLUG_INVALID_INPUT cho mọi hàm', () => {
  for (const bad of [null, undefined, 1, {}, []]) {
    assert.throws(() => fold(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', bad), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
});
