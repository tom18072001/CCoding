import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi } from '../src/slug/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('fold', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('ơư Ơ'), 'ou O');
  for (const bad of [null, undefined, 1, {}]) assert.equal(code(() => fold(bad)), 'SLUG_INVALID_INPUT');
});

test('slugify', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('１２３ x'), 'x');
  assert.equal(slugify('Việt'), 'viet');
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 4 }), 'ab');
  for (const m of [0, -1, 1.5, '3', null, NaN]) {
    if (m === null) continue;
    assert.equal(code(() => slugify('', { maxLength: m })), 'SLUG_INVALID_MAXLENGTH');
  }
  assert.equal(code(() => slugify(5)), 'SLUG_INVALID_INPUT');
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-4'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.equal(code(() => uniqueSlug('', [])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => uniqueSlug('a', 'a')), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => uniqueSlug(1, [])), 'SLUG_INVALID_INPUT');
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('a', 'b'), false);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.equal(code(() => looseEquals('a', null)), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => looseIncludes(undefined, 'a')), 'SLUG_INVALID_INPUT');
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
  lt('d', 'đ');
  lt('đ', 'e');
  lt('y', 'f');
  lt('f', 'j');
  lt('j', 'w');
  lt('w', 'z');
  lt('1', 'a');
  lt(' ', '1');
  lt('a b', 'ab');
  lt('o', 'ô');
  lt('ô', 'ơ');
  lt('u', 'ư');
  lt('a', 'à');
  lt('à', 'ả');
  lt('ả', 'ã');
  lt('ã', 'á');
  lt('á', 'ạ');
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('a', 'a̸'), 0);
  assert.equal(compareVi('x', 'x'), 0);
  assert.equal(code(() => compareVi('a', 1)), 'SLUG_INVALID_INPUT');
});

test('sortVi', () => {
  assert.deepEqual(
    sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const src = ['b', 'a'];
  const out = sortVi(src);
  assert.notEqual(out, src);
  assert.deepEqual(src, ['b', 'a']);
  // ổn định
  assert.deepEqual(sortVi(['ệ', 'ệ']), ['ệ', 'ệ']);
  assert.deepEqual(sortVi(['ệ', 'ệ']), ['ệ', 'ệ']);
  assert.equal(code(() => sortVi('a')), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => sortVi(['a', 1])), 'SLUG_INVALID_INPUT');
});
