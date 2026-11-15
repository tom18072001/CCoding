import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fold, looseEquals, sortVi } from '../src/slug/index.js';

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

// ---- Mở rộng ----
import { uniqueSlug, looseIncludes, compareVi } from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;

test('fold: NFD, đ/Đ, giữ nguyên ký tự khác, trả NFC', () => {
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('Đđ ơư ăâ'), 'Dd ou aa');
  assert.equal(fold('ệ'), 'e');
  assert.equal(fold('Việt'.normalize('NFD')), 'Viet');
  assert.throws(() => fold(undefined), code('SLUG_INVALID_INPUT'));
  assert.throws(() => fold(5), code('SLUG_INVALID_INPUT'));
});

test('slugify: ví dụ spec và ký tự lạ', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('Việt'.normalize('NFD')), 'viet');
  assert.equal(slugify('１２３'), '');
});

test('slugify: maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 1 }), 'a');
  assert.equal(slugify('ab', { maxLength: 100 }), 'ab');
  for (const m of [0, -1, 1.5, '3', null, NaN, Infinity]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
    assert.throws(() => slugify('', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify(1, { maxLength: 0 }), code('SLUG_INVALID_INPUT'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-3'])), 'abc-4');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const arr = ['abc'];
  uniqueSlug('abc', arr);
  assert.deepEqual(arr, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(null, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a'), code('SLUG_INVALID_INPUT'));
});

test('looseEquals / looseIncludes', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.equal(looseEquals('Hà Nội', 'ha noi'), true);
  assert.equal(looseEquals('Hà Nội', 'ha  noi 2'), false);
  assert.equal(looseEquals('ệ', 'ệ'), true);
  assert.throws(() => looseEquals('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => looseIncludes(1, 'a'), code('SLUG_INVALID_INPUT'));
});

test('compareVi: hệ quả spec', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('', ''), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
});

test('compareVi: bảng chữ cái, ký tự ngoài bảng, thanh điệu', () => {
  const order = [...'aăâbcdđeêghiklmnoôơpqrstuưvxyfjwz'];
  for (let i = 0; i + 1 < order.length; i++) {
    assert.equal(compareVi(order[i], order[i + 1]), -1, order[i] + '<' + order[i + 1]);
    assert.equal(compareVi(order[i + 1], order[i]), 1);
  }
  assert.equal(compareVi('1', 'a'), -1);
  assert.equal(compareVi(' ', '1'), -1);
  assert.equal(compareVi('a b', 'ab'), -1);
  assert.equal(compareVi('z', '9'), 1);
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i + 1 < tones.length; i++) assert.equal(compareVi(tones[i], tones[i + 1]), -1);
  assert.equal(compareVi('ạb', 'ab'), 1);
  assert.equal(compareVi('ab', 'ạa'), 1); // mức 1 thắng thanh điệu
  assert.throws(() => compareVi('a', 1), code('SLUG_INVALID_INPUT'));
  assert.throws(() => compareVi(undefined, 'a'), code('SLUG_INVALID_INPUT'));
});

test('sortVi: ví dụ spec, ổn định, không sửa list', () => {
  const list = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...list];
  const r = sortVi(list);
  assert.deepEqual(r, ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(list, copy);
  assert.notEqual(r, list);
  const nfd = 'ệ'.normalize('NFD');
  assert.deepEqual(sortVi([nfd, 'ệ']), [nfd, 'ệ']);
  assert.deepEqual(sortVi(['ệ', nfd]), ['ệ', nfd]);
  assert.deepEqual(sortVi([]), []);
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
});
