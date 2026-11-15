import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/slug/index.js';

const code = (f, c) => assert.throws(f, (e) => e.code === c);

test('slugify và fold', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('ệ'), 'e');
  assert.equal(S.slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(S.slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(S.slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(S.slugify('Straße'), 'stra-e');
  assert.equal(S.slugify('日本'), '');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(S.slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(S.slugify('extraordinary day', { maxLength: 5 }), 'extra');
  code(() => S.slugify('', { maxLength: 0 }), 'SLUG_INVALID_MAXLENGTH');
  code(() => S.slugify('a', { maxLength: 1.5 }), 'SLUG_INVALID_MAXLENGTH');
  code(() => S.slugify(null), 'SLUG_INVALID_INPUT');
});
test('uniqueSlug và so khớp', () => {
  assert.equal(S.uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  assert.equal(S.uniqueSlug('a', new Set(['a', 'a-2'])), 'a-3');
  code(() => S.uniqueSlug('', []), 'SLUG_INVALID_INPUT');
  code(() => S.uniqueSlug('a', 'a'), 'SLUG_INVALID_INPUT');
  assert.ok(S.looseEquals('Đà   Nẵng ', 'da nang'));
  assert.ok(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'));
  assert.ok(S.looseIncludes('abc', '  '));
});
test('sắp xếp tiếng Việt', () => {
  assert.deepEqual(S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  const lt = (a, b) => assert.equal(S.compareVi(a, b), -1, `${a} < ${b}`);
  lt('A', 'b'); lt('ạ', 'b'); lt('ặ', 'ấ'); lt('a', 'Á'); lt('a', 'A'); lt('an', 'anh'); lt('', 'a');
  lt('1', 'a'); lt('y', 'f'); lt('f', 'w'); lt('z', 'za'); lt('d', 'đ'); lt('đ', 'e');
  assert.equal(S.compareVi('á', 'A'), 1);
  assert.equal(S.compareVi('ệ', 'ệ'), 0);
  assert.equal(S.compareVi('x', 'x'), 0);
  const list = ['b', 'a'];
  assert.notEqual(S.sortVi(list), list);
  code(() => S.sortVi(['a', 1]), 'SLUG_INVALID_INPUT');
  code(() => S.compareVi('a'), 'SLUG_INVALID_INPUT');
});
