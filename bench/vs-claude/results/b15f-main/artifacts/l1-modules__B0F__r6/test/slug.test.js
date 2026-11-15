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

test('fold: NFD/NFC và đ/Đ', () => {
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('Đđ ơư ăâ'), 'Dd ou aa');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(slugify('Việt Nam'), 'viet-nam');
});

test('slugify: phân cách và maxLength', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
  assert.throws(() => slugify('a', { maxLength: 1.5 }), code('SLUG_INVALID_MAXLENGTH'));
  assert.throws(() => slugify('a', { maxLength: '3' }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc-2', new Set(['abc-2'])), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'd'), false);
});

test('compareVi: bảng chữ cái', () => {
  const order = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n',
    'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y', 'f', 'j', 'w', 'z'];
  for (let i = 0; i + 1 < order.length; i++) {
    assert.equal(compareVi(order[i], order[i + 1]), -1, order[i]);
    assert.equal(compareVi(order[i + 1], order[i]), 1);
  }
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
});

test('compareVi: thanh điệu, hoa/thường, NFD, phá hòa', () => {
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i + 1 < tones.length; i++) assert.equal(compareVi(tones[i], tones[i + 1]), -1);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('x', 'x'), 0);
  assert.equal(compareVi('ä', 'a'), 0);
  assert.equal(compareVi('Đ', 'đ'), 1);
});

test('sortVi: ví dụ SPEC, ổn định, không đổi đầu vào', () => {
  const input = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...input];
  assert.deepEqual(sortVi(input), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(input, copy);
  assert.deepEqual(sortVi(['ệ', 'ệ', 'a']), ['a', 'ệ', 'ệ']);
});

test('mã lỗi SLUG_INVALID_INPUT cho mọi hàm', () => {
  for (const b of [null, undefined, 1]) {
    assert.throws(() => fold(b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(b, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', b), code('SLUG_INVALID_INPUT'));
    assert.throws(() => sortVi(b), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
