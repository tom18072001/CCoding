import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, fold, looseEquals, sortVi, uniqueSlug, looseIncludes, compareVi,
} from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const sl = slugify;
const fd = fold;

test('mọi hàm: sai kiểu → SLUG_INVALID_INPUT', () => {
  for (const bad of [null, undefined, 5, {}]) {
    assert.throws(() => fd(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => sl(bad), code('SLUG_INVALID_INPUT'));
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

test('fold: NFC/NFD, đ/Đ, giữ nguyên ký tự khác', () => {
  assert.equal(fd('abc 123 !?'), 'abc 123 !?');
  assert.equal(fd('ệ'), 'e');
  assert.equal(fd('ệ'), 'e');
  assert.equal(fd('Đđ ơư ăâ'), 'Dd ou aa');
  assert.equal(fd('日本'), '日本');
});

test('slugify: ví dụ và ký tự phân cách', () => {
  assert.equal(sl('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(sl('Straße'), 'stra-e');
  assert.equal(sl('日本 abc'), 'abc');
  assert.equal(sl('a_b.c'), 'a-b-c');
  assert.equal(sl('１２３'), '');
  assert.equal(sl('---'), '');
  assert.equal(sl(''), '');
  assert.equal(sl('ệ x'), 'e-x');
});

test('slugify maxLength', () => {
  assert.equal(sl('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(sl('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(sl('ab cd', { maxLength: 4 }), 'ab');
  assert.equal(sl('ab cd', { maxLength: 5 }), 'ab-cd');
  assert.equal(sl('abc', {}), 'abc');
  for (const m of [0, -1, 1.5, '3', NaN, null, Infinity]) {
    assert.throws(() => sl('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => sl('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-2', 'abc-4'])), 'abc-3');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const ex = ['abc'];
  uniqueSlug('abc', ex);
  assert.deepEqual(ex, ['abc']);
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(1, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a'), code('SLUG_INVALID_INPUT'));
});

test('looseIncludes / looseEquals', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('abc', '  '), true);
  assert.equal(looseIncludes('abc', 'abd'), false);
  assert.equal(looseEquals('A\t\nB', 'a b'), true);
  assert.equal(looseEquals('a', 'b'), false);
});

test('compareVi: ba mức và hệ quả', () => {
  const lt = (a, b) => {
    assert.equal(compareVi(a, b), -1, `${a}<${b}`);
    assert.equal(compareVi(b, a), 1);
  };
  lt('A', 'b'); lt('ạ', 'b'); lt('ặ', 'ấ'); lt('a', 'Á'); lt('A', 'á');
  lt('a', 'A'); lt('an', 'anh'); lt('', 'a'); lt('1', 'a'); lt(' a', 'a'); lt('z', 'zz');
  lt('d', 'đ'); lt('đ', 'e'); lt('y', 'f'); lt('f', 'j'); lt('j', 'w'); lt('w', 'z');
  lt('o', 'ô'); lt('ô', 'ơ'); lt('u', 'ư'); lt('a', 'ă'); lt('ă', 'â');
  lt('ab', 'aB'); lt('aB', 'Ab');
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('aͅ', 'a'), 0);
  const tones = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i < 5; i++) lt(tones[i], tones[i + 1]);
});

test('sortVi: ví dụ, ổn định, không sửa đầu vào', () => {
  const src = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang'];
  const copy = [...src];
  assert.deepEqual(sortVi(src), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(src, copy);
  assert.deepEqual(sortVi(['é', 'é', 'É', 'é']), ['é', 'é', 'é', 'É']);
  assert.deepEqual(sortVi([]), []);
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
