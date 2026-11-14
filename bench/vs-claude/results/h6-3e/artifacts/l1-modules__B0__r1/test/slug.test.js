import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const IN = 'SLUG_INVALID_INPUT';

test('fold: đ/Đ, giữ hoa thường, NFC/NFD', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('đĐơƯ'), 'dDoU');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ệ'), fold('ệ'));
});

test('slugify cơ bản và ký tự phân cách', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('１２'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify('ệ'), 'e');
});

test('slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('abc', { maxLength: 3 }), 'abc');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('x', {}), 'x');
});

test('slugify SLUG_INVALID_MAXLENGTH và SLUG_INVALID_INPUT', () => {
  for (const m of [0, -1, 1.5, '5', NaN, Infinity, null]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
  for (const v of [null, undefined, 1, {}, []]) assert.throws(() => slugify(v), code(IN));
  assert.throws(() => fold(null), code(IN));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-3'])), 'abc-4');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code(IN));
  assert.throws(() => uniqueSlug(1, []), code(IN));
  assert.throws(() => uniqueSlug('a', 'a'), code(IN));
  assert.throws(() => uniqueSlug('a'), code(IN));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseEquals('á', 'Á'), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('Thành phố', 'xyz'), false);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('a  b', 'a b'), true);
  assert.throws(() => looseEquals('a', null), code(IN));
  assert.throws(() => looseIncludes(1, 'a'), code(IN));
  assert.throws(() => looseIncludes('a', undefined), code(IN));
});

test('compareVi các mức', () => {
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('a', 'a'), 0);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('d', 'đ'), -1);
  assert.equal(compareVi('đ', 'e'), -1);
  assert.equal(compareVi('y', 'f'), -1);
  assert.equal(compareVi('f', 'j'), -1);
  assert.equal(compareVi('j', 'w'), -1);
  assert.equal(compareVi('w', 'z'), -1);
  assert.equal(compareVi('ơ', 'p'), -1);
  assert.equal(compareVi('o', 'ô'), -1);
  assert.equal(compareVi('ư', 'v'), -1);
  assert.equal(compareVi('à', 'ả'), -1);
  assert.equal(compareVi('ã', 'á'), -1);
  assert.equal(compareVi('á', 'ạ'), -1);
  assert.throws(() => compareVi(1, 'a'), code(IN));
});

test('sortVi', () => {
  assert.deepEqual(
    sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const src = ['b', 'a'];
  const r = sortVi(src);
  assert.notEqual(r, src);
  assert.deepEqual(src, ['b', 'a']);
  // ổn định: NFC/NFD bằng nhau giữ thứ tự gốc
  assert.deepEqual(sortVi(['ệ', 'ệ', 'a']), ['a', 'ệ', 'ệ']);
  assert.throws(() => sortVi('a'), code(IN));
  assert.throws(() => sortVi(['a', 1]), code(IN));
});
