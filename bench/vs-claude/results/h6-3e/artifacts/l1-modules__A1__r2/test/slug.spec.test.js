import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi,
} from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const NFD = (s) => s.normalize('NFD');

test('fold', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('đĐơƠưƯăĂâÂêÊôÔ'), 'dDoOuUaAaAeEoO');
  assert.equal(fold(NFD('Việt Nặng ỗ')), 'Viet Nang o');
  assert.equal(fold('日本 ß'), '日本 ß');
  assert.equal(fold(''), '');
  assert.equal(fold('Café'), 'Cafe');
});

test('slugify', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('１２３'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify(NFD('Hệ Thống')), 'he-thong');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('xin chao viet nam', { maxLength: 100 }), 'xin-chao-viet-nam');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 1 }), 'a');
  assert.equal(slugify('', { maxLength: 1 }), '');
  for (const m of [0, -1, 1.5, '3', null, NaN, Infinity]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
  assert.equal(slugify('abc', { maxLength: undefined }), 'abc');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-4'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  for (const [b, e] of [['', []], [5, []], ['a', null], ['a', 'a'], ['a', {}]]) {
    assert.throws(() => uniqueSlug(b, e), code('SLUG_INVALID_INPUT'));
  }
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('Đà Nẵng', 'da nang!'), false);
  assert.equal(looseEquals('A\tB', 'a  b'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'HỒ   CHÍ'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'abcd'), false);
  assert.throws(() => looseEquals(null, 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes('a', 1), code('SLUG_INVALID_INPUT'));
});

test('compareVi', () => {
  const lt = (a, b) => {
    assert.equal(compareVi(a, b), -1, `${a} < ${b}`);
    assert.equal(compareVi(b, a), 1, `${b} > ${a}`);
  };
  lt('an', 'anh');
  lt('', 'a');
  lt('A', 'b');
  lt('ạ', 'b');
  lt('ặ', 'ấ');
  lt('a', 'Á');
  lt('A', 'á');
  lt('a', 'A');
  lt('a', 'ă');
  lt('ă', 'â');
  lt('d', 'đ');
  lt('đ', 'e');
  lt('y', 'f');
  lt('f', 'j');
  lt('j', 'w');
  lt('w', 'z');
  lt('1', 'a');
  lt(' ', '1');
  lt('1', '2');
  lt('o', 'ô');
  lt('ô', 'ơ');
  lt('u', 'ư');
  lt('ơ', 'p');
  lt('à', 'ả');
  lt('ả', 'ã');
  lt('ã', 'á');
  lt('á', 'ạ');
  lt('ba', 'bà');
  lt('ab', 'Ab');
  lt('Ab', 'aB'.replace('B', 'c'));
  assert.equal(compareVi('ệ', NFD('ệ')), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ä', 'a'), 0);
  assert.equal(compareVi('abc', 'abc'), 0);
  assert.throws(() => compareVi(1, 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => compareVi('a'), code('SLUG_INVALID_INPUT'));
});

test('sortVi', () => {
  assert.deepEqual(
    sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const input = ['b', 'a', 'A'];
  const out = sortVi(input);
  assert.deepEqual(input, ['b', 'a', 'A']);
  assert.notEqual(out, input);
  assert.deepEqual(out, ['a', 'A', 'b']);
  // ổn định: NFC và NFD của cùng chữ bằng nhau, giữ thứ tự gốc
  const x = 'ệ';
  const y = NFD('ệ');
  assert.deepEqual(sortVi([y, x]), [y, x]);
  assert.deepEqual(sortVi([x, y]), [x, y]);
  assert.deepEqual(sortVi([]), []);
  assert.throws(() => sortVi('a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
