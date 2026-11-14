import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi,
} from '../src/slug/index.js';

const NFD = (s) => s.normalize('NFD');
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

test('NFC và NFD cho kết quả như nhau', () => {
  const s = 'Đặng Thị Ánh Việt';
  assert.equal(fold(NFD(s)), fold(s));
  assert.equal(fold(NFD(s)), fold(NFD(s)).normalize('NFC'));
  assert.equal(slugify(NFD(s)), slugify(s));
  assert.equal(looseEquals(NFD('Đà Nẵng'), 'da nang'), true);
  assert.equal(looseIncludes(NFD('Hồ Chí Minh'), 'ho chi'), true);
  assert.equal(compareVi(NFD('ệ'), 'ệ'), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('a̸', 'a'), 0);
});

test('slugify ví dụ và biên', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('', { maxLength: 3 }), '');
  for (const bad of [0, -1, 1.5, '3', NaN]) {
    assert.throws(() => slugify('abc', { maxLength: bad }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
});

test('hệ quả mức so sánh (dòng 435)', () => {
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
});

test('f j w z sau y, đ sau d', () => {
  assert.deepEqual(sortVi(['z', 'w', 'j', 'f', 'y', 'x']), ['x', 'y', 'f', 'j', 'w', 'z']);
  assert.deepEqual(sortVi(['e', 'đ', 'd', 'ê']), ['d', 'đ', 'e', 'ê']);
});

test('đủ 6 thanh, NFD cũng đúng', () => {
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  assert.deepEqual(sortVi(tones.map(NFD).reverse()).map((s) => s.normalize('NFC')), tones);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) assert.equal(compareVi(tones[i], tones[j]), Math.sign(i - j));
  }
});

test('sortVi: ví dụ, tie ổn định, không đổi đầu vào', () => {
  const cities = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  assert.deepEqual(sortVi(cities), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  const a = 'ệ';
  const b = NFD('ệ');
  const c = 'ệ';
  const input = [b, 'z', a, c];
  const copy = input.slice();
  const out = sortVi(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  assert.ok(out[0] === b && out[1] === a && out[2] === c && out[3] === 'z');
});

test('đầu vào sai kiểu', () => {
  const fns = [fold, (x) => looseEquals(x, 'a'), (x) => looseEquals('a', x), (x) => looseIncludes(x, 'a'),
    (x) => compareVi(x, 'a'), (x) => compareVi('a', x), slugify];
  for (const f of fns) {
    for (const bad of [null, undefined, 5, {}]) assert.throws(() => f(bad), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
