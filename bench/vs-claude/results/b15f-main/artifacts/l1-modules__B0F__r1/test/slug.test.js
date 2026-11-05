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

const code = (c) => (e) => e.code === c;

test('fold: rỗng, ký tự đặc biệt, NFC/NFD', () => {
  assert.equal(fold(''), '');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('Đ đ'), 'D d');
  assert.equal(fold('ƠƯ ơư ăâ'), 'OU ou aa');
  assert.equal(fold('Á'), 'A');
});

test('slugify: rỗng, đặc biệt, cặp chữ', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本 abc'), 'abc');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２３'), '');
  assert.equal(slugify('a ă â'), 'a-a-a');
  assert.equal(slugify('d đ Đ'), 'd-d-d');
  assert.equal(slugify('o ô ơ'), 'o-o-o');
  assert.equal(slugify('u ư'), 'u-u');
  assert.equal(slugify('Việt'), slugify('Việt'));
});

test('slugify: maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 100 }), 'ab-cd');
  assert.equal(slugify('abc', { maxLength: 1 }), 'a');
  assert.equal(slugify('ab cd', {}), 'ab-cd');
  assert.equal(slugify('ab cd', { maxLength: undefined }), 'ab-cd');
  for (const bad of [0, -1, 1.5, '3', NaN, null, Infinity]) {
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
  const arr = ['abc'];
  uniqueSlug('abc', arr);
  assert.deepEqual(arr, ['abc']);
  const set = new Set(['abc']);
  uniqueSlug('abc', set);
  assert.equal(set.size, 1);
});

test('SLUG_INVALID_INPUT mọi hàm', () => {
  for (const b of [null, undefined, 1, {}, []]) {
    assert.throws(() => fold(b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', b), code('SLUG_INVALID_INPUT'));
  }
  for (const b of [null, undefined, '', 5]) {
    assert.throws(() => uniqueSlug(b, []), code('SLUG_INVALID_INPUT'));
  }
  for (const e of [null, undefined, 'abc', {}, 1]) {
    assert.throws(() => uniqueSlug('abc', e), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});

test('so khớp không dấu: thêm', () => {
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseEquals('Việt', 'Việt'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ha noi'), false);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('', ''), true);
});

test('compareVi: ba mức', () => {
  assert.equal(compareVi('a', 'a'), 0);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('anh', 'an'), 1);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'ă'), -1);
  assert.equal(compareVi('ă', 'â'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('D', 'đ'), -1);
  assert.equal(compareVi('o', 'ô'), -1);
  assert.equal(compareVi('ô', 'ơ'), -1);
  assert.equal(compareVi('u', 'ư'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('à', 'ả'), -1);
  assert.equal(compareVi('ã', 'á'), -1);
  assert.equal(compareVi('á', 'ạ'), -1);
});

test('sortVi: ví dụ SPEC, ổn định, không mutate', () => {
  const list = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...list];
  const out = sortVi(list);
  assert.deepEqual(out, ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(list, copy);
  assert.notEqual(out, list);
  const a = 'ệ';
  const b = 'ệ';
  assert.deepEqual(sortVi([b, a]), [b, a]);
  assert.deepEqual(sortVi([a, b]), [a, b]);
  assert.deepEqual(sortVi([]), []);
});
