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

test('NFD và NFC cho cùng kết quả', () => {
  const nfc = 'Việt Nam ệ';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(fold(nfd), fold(nfc));
  assert.equal(fold(nfd), 'Viet Nam e');
  assert.equal(slugify(nfd), slugify(nfc));
  assert.equal(looseEquals(nfd, nfc), true);
  assert.equal(compareVi(nfd, nfc), 0);
});

test('fold: đ, Đ, ă/â/ơ/ô/ư, ký tự khác giữ nguyên', () => {
  assert.equal(fold('đĐ'), 'dD');
  assert.equal(fold('ăâơôưê'), 'aaooue');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Straße'), 'Straße');
});

test('slugify ví dụ SPEC và maxLength', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 1 }), 'a');
  assert.equal(slugify('', { maxLength: 3 }), '');
});

test('slugify maxLength không hợp lệ', () => {
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
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
});

test('compareVi: mức 1 (ă/â/a, ơ/ô/o, đ/d)', () => {
  const pairs = [['a', 'ă'], ['ă', 'â'], ['â', 'b'], ['o', 'ô'], ['ô', 'ơ'], ['ơ', 'p'], ['d', 'đ'], ['đ', 'e'], ['y', 'f'], ['f', 'j'], ['j', 'w'], ['w', 'z'], ['ư', 'v']];
  for (const [x, y] of pairs) {
    assert.equal(compareVi(x, y), -1, `${x} < ${y}`);
    assert.equal(compareVi(y, x), 1, `${y} > ${x}`);
  }
});

test('compareVi: ví dụ hệ quả SPEC', () => {
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('x', 'x'), 0);
});

test('compareVi: ký tự không phải chữ cái đứng trước chữ cái, theo mã Unicode', () => {
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('a b', 'ab'), -1);
  assert.equal(compareVi('1', '2'), -1);
  assert.equal(compareVi('-', 'a'), -1);
});

test('compareVi: đủ sáu thanh, kể cả NFD', () => {
  const order = ['e', 'è', 'ẻ', 'ẽ', 'é', 'ẹ'];
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(compareVi(order[i], order[i + 1]), -1);
    assert.equal(compareVi(order[i + 1].normalize('NFD'), order[i]), 1);
  }
  assert.equal(compareVi('ệ', 'ế'), 1);
});

test('sortVi ví dụ tỉnh thành', () => {
  const input = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  assert.deepEqual(sortVi(input), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
});

test('sortVi ổn định, không đổi mảng đầu vào', () => {
  const a = 'á';
  const b = 'á'.normalize('NFD');
  const input = [b, 'a', a, 'A'];
  const copy = [...input];
  const out = sortVi(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  assert.deepEqual(out, ['a', 'A', b, a]);
});

test('mã lỗi SLUG_INVALID_INPUT cho mọi hàm', () => {
  for (const bad of [null, undefined, 1, {}, []]) {
    assert.throws(() => fold(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', bad), code('SLUG_INVALID_INPUT'));
  }
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
