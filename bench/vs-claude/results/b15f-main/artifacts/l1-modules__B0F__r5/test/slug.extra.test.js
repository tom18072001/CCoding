import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi,
} from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const NFD = (s) => s.normalize('NFD');

test('fold: đ/Đ, giữ hoa/thường, ký tự khác, NFC/NFD', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('đ Đ ơ ư'), 'd D o u');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold(NFD('ệ')), 'e');
  assert.equal(fold('ệ'), fold(NFD('ệ')));
  assert.equal(fold('日本'), '日本');
});

test('slugify: ví dụ SPEC và ký tự phân cách', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('１２'), '');
  assert.equal(slugify(NFD('Việt Nam')), 'viet-nam');
});

test('slugify: maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(slugify('abc', { maxLength: 3 }), 'abc');
  assert.equal(slugify('abc', {}), 'abc');
  for (const bad of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: bad }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug: hậu tố, Set, không sửa existing', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2', 'abc-4']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const s = new Set(['x', 'x-2']);
  assert.equal(uniqueSlug('x', s), 'x-3');
  assert.equal(s.size, 2);
  const arr = ['x'];
  uniqueSlug('x', arr);
  assert.deepEqual(arr, ['x']);
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseEquals(NFD('Huế'), 'HUE'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'hochi'), false);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', ''), true);
});

test('compareVi: mức 1 chữ cái', () => {
  assert.equal(compareVi('a', 'ă'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('â', 'b'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('e', 'ê'), -1);
  assert.equal(compareVi('o', 'ô'), -1);
  assert.equal(compareVi('ô', 'ơ'), -1);
  assert.equal(compareVi('ơ', 'p'), -1);
  assert.equal(compareVi('u', 'ư'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('anh', 'an'), 1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('A', 'b'), -1);
});

test('compareVi: mức 2 thanh điệu và mức 3 hoa/thường', () => {
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i < tones.length - 1; i++) {
    assert.equal(compareVi(tones[i], tones[i + 1]), -1);
    assert.equal(compareVi(tones[i + 1], tones[i]), 1);
  }
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('ab', 'aB'), -1);
  assert.equal(compareVi('Ab', 'aB'), 1); // vị trí khác nhau đầu tiên quyết định
});

test('compareVi: NFC/NFD, bằng nhau, kiểu trả về', () => {
  assert.equal(compareVi('ệ', NFD('ệ')), 0);
  assert.equal(compareVi(NFD('Đà Nẵng'), 'Đà Nẵng'), 0);
  assert.equal(compareVi('abc', 'abc'), 0);
  assert.equal(compareVi('ä', 'a'), 0); // dấu kết hợp lạ
  assert.ok(Object.is(compareVi('a', 'a'), 0));
  assert.equal(compareVi('c', 'a'), 1);
});

test('sortVi: ví dụ SPEC, ổn định, không sửa đầu vào', () => {
  const cities = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  assert.deepEqual(sortVi(cities), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.equal(cities[0], 'Huế');
  const input = ['ạ', 'ã', 'á', 'ả', 'à', 'a'];
  const copy = [...input];
  const out = sortVi(input);
  assert.deepEqual(out, ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  // ổn định: NFC và NFD bằng nhau giữ thứ tự gốc
  const nfc = 'ệ';
  const nfd = NFD('ệ');
  assert.deepEqual(sortVi([nfd, nfc, nfd]), [nfd, nfc, nfd]);
  assert.deepEqual(sortVi([nfc, nfd]), [nfc, nfd]);
  assert.deepEqual(sortVi([]), []);
});

test('mã lỗi SLUG_INVALID_INPUT', () => {
  const bad = [null, undefined, 1, {}, []];
  for (const v of bad) {
    assert.throws(() => fold(v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(v, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(v, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(v, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', v), code('SLUG_INVALID_INPUT'));
    assert.throws(() => uniqueSlug(v, []), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
});
