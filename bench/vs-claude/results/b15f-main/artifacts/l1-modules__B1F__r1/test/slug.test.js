import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

test('NFD và NFC cho kết quả như nhau', () => {
  const nfc = 'Việt Đệ';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(fold(nfd), 'Viet De');
  assert.equal(slugify(nfd), slugify(nfc));
  assert.equal(looseEquals(nfd, nfc), true);
  assert.equal(compareVi(nfd, nfc), 0);
});

test('slugify ký tự đặc biệt', () => {
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c   d'), 'a-b-c-d');
  assert.equal(slugify(''), '');
  assert.equal(slugify('ＡＢ１'), '');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('abc', { maxLength: 3 }), 'abc');
  for (const m of [0, -1, 1.5, '3', NaN, null]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
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
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
});

test('compareVi theo bảng SPEC', () => {
  const lt = (a, b) => {
    assert.equal(compareVi(a, b), -1, `${a} < ${b}`);
    assert.equal(compareVi(b, a), 1, `${b} > ${a}`);
  };
  lt('A', 'b');
  lt('ạ', 'b');
  lt('ặ', 'ấ');
  lt('a', 'Á');
  lt('A', 'á');
  lt('a', 'A');
  lt('an', 'anh');
  lt('', 'a');
  lt('1', 'a');
  lt(' a', 'a');
  lt('d', 'đ');
  lt('đ', 'e');
  lt('y', 'f');
  lt('f', 'j');
  lt('j', 'w');
  lt('w', 'z');
  lt('o', 'ô');
  lt('ô', 'ơ');
  lt('u', 'ư');
  assert.equal(compareVi('x', 'x'), 0);
});

test('sortVi theo SPEC, ổn định, không sửa đầu vào', () => {
  const input = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...input];
  const out = sortVi(input);
  assert.deepEqual(out, ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  const a = 'ệ';
  const b = a.normalize('NFD');
  assert.deepEqual(sortVi([b, a, 'a']), ['a', b, a]);
});

test('mã lỗi SLUG_INVALID_INPUT cho mọi hàm', () => {
  for (const bad of [null, undefined, 5]) {
    assert.throws(() => fold(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', bad), code('SLUG_INVALID_INPUT'));
  }
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
