import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, fold, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi,
} from '../src/slug/index.js';

const code = (c) => (e) => e.code === c;
const NFD = (s) => s.normalize('NFD');

test('[SPEC:397] mọi hàm ném SLUG_INVALID_INPUT với đầu vào không phải chuỗi', () => {
  for (const bad of [null, undefined, 5, {}, []]) {
    assert.throws(() => fold(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => slugify(bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseEquals('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => looseIncludes('a', bad), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi(bad, 'a'), code('SLUG_INVALID_INPUT'));
    assert.throws(() => compareVi('a', bad), code('SLUG_INVALID_INPUT'));
  }
});

test('[SPEC:401] fold ví dụ nguyên văn và giữ hoa/thường', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(fold('đĐ'), 'dD');
  assert.equal(fold('ơƯăâêô'), 'oUaaeo');
});

test('[SPEC:397,401] fold NFC và NFD cho kết quả như nhau', () => {
  const s = 'Việt Nam Ệ';
  assert.equal(fold(NFD(s)), fold(s));
  assert.equal(fold(NFD(s)), 'Viet Nam E');
  assert.equal(fold('ß日'), 'ß日');
});

test('[SPEC:410] slugify ví dụ nguyên văn', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('Straße'), 'stra-e');
});

test('[SPEC:406-407] slugify: ký tự lạ là phân cách, rỗng, NFD', () => {
  assert.equal(slugify('a_b.c'), 'a-b-c');
  assert.equal(slugify('日本'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify('１２'), '');
  assert.equal(slugify('---'), '');
  assert.equal(slugify(NFD('Xin chào Việt Nam')), 'xin-chao-viet-nam');
});

test('[SPEC:408,411] slugify maxLength', () => {
  assert.equal(slugify('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('xin chao', { maxLength: 100 }), 'xin-chao');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('abc', { maxLength: 1 }), 'a');
  assert.equal(slugify('ab cd', {}), 'ab-cd');
});

test('[SPEC:408] slugify SLUG_INVALID_MAXLENGTH, kể cả text rỗng', () => {
  for (const m of [0, -1, 1.5, '5', NaN, null, Infinity]) {
    assert.throws(() => slugify('abc', { maxLength: m }), code('SLUG_INVALID_MAXLENGTH'));
  }
  assert.throws(() => slugify('', { maxLength: 0 }), code('SLUG_INVALID_MAXLENGTH'));
});

test('[SPEC:415] uniqueSlug', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2', 'abc-3']), 'abc-4');
  assert.equal(uniqueSlug('abc', new Set(['abc', 'abc-3'])), 'abc-2');
  assert.equal(uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  const arr = ['abc'];
  uniqueSlug('abc', arr);
  assert.deepEqual(arr, ['abc']);
  const set = new Set(['abc']);
  uniqueSlug('abc', set);
  assert.equal(set.size, 1);
});

test('[SPEC:415] uniqueSlug lỗi đầu vào', () => {
  assert.throws(() => uniqueSlug('', []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug(null, []), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => uniqueSlug('a', 'a'), code('SLUG_INVALID_INPUT'));
});

test('[SPEC:419] looseEquals / looseIncludes', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals(NFD('Đà   Nẵng '), 'DA NANG'), true);
  assert.equal(looseEquals('da nang', 'da nangs'), false);
  assert.equal(looseEquals('', '  \t '), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes(NFD('Thành phố Hồ Chí Minh'), NFD('HỒ  CHÍ')), true);
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'hanoi'), false);
  assert.equal(looseIncludes('abc', ''), true);
  assert.equal(looseIncludes('abc', '   '), true);
  assert.equal(looseIncludes('', ''), true);
});

test('[SPEC:425-429] compareVi mức 1: bảng chữ cái, f j w z sau y, ký tự lạ trước', () => {
  const asc = [['a', 'b'], ['a', 'ă'], ['ă', 'â'], ['d', 'đ'], ['đ', 'e'], ['y', 'f'], ['f', 'j'],
    ['j', 'w'], ['w', 'z'], ['1', 'a'], [' ', 'a'], [' ', '1'], ['an', 'anh'], ['', 'a'],
    ['o', 'ô'], ['ô', 'ơ'], ['ơ', 'p'], ['u', 'ư'], ['ư', 'v']];
  for (const [x, y] of asc) {
    assert.equal(compareVi(x, y), -1, `${x} < ${y}`);
    assert.equal(compareVi(y, x), 1, `${y} > ${x}`);
  }
});

test('[SPEC:431] compareVi mức 2: thanh điệu', () => {
  const order = ['a', 'à', 'ả', 'ã', 'á', 'ạ'];
  for (let i = 0; i < order.length; i++) {
    for (let j = 0; j < order.length; j++) {
      assert.equal(compareVi(order[i], order[j]), Math.sign(i - j));
      assert.equal(compareVi(NFD(order[i]), order[j]), Math.sign(i - j));
    }
  }
  assert.equal(compareVi('ệ', 'ế'), 1);
  assert.equal(compareVi('ế', 'ề'), 1);
  assert.equal(compareVi('ca', 'cà'), -1);
  assert.equal(compareVi('àb', 'áb'), -1);
});

test('[SPEC:433] compareVi mức 3: thường trước hoa', () => {
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('ab', 'aB'), -1);
  assert.equal(compareVi('Ab', 'aB'), 1);
});

test('[SPEC:435] hệ quả: mức trước thắng mức sau', () => {
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('Đ', 'e'), -1);
});

test('[SPEC:435,437] compareVi: NFC/NFD = 0, chỉ trả -1/0/1', () => {
  assert.equal(compareVi('Việt', NFD('Việt')), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('ệ', 'ệ'), 0);
  assert.equal(compareVi('abc', 'abc'), 0);
  assert.equal(compareVi('', ''), 0);
  for (const [x, y] of [['a', 'z'], ['z', 'a'], ['ạ', 'a'], ['anh', 'b'], ['b', 'anh']]) {
    assert.ok([-1, 1].includes(compareVi(x, y)));
  }
});

test('[SPEC:439] sortVi ví dụ nguyên văn', () => {
  assert.deepEqual(
    sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế'],
  );
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
});

test('[SPEC:437] sortVi: NFD, mảng mới, ổn định, không sửa đầu vào', () => {
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a'].map(NFD)), ['a', 'à', 'ả', 'ã', 'á', 'ạ'].map(NFD));
  const input = ['b', 'A', 'a', 'á'];
  const copy = [...input];
  const out = sortVi(input);
  assert.notEqual(out, input);
  assert.deepEqual(input, copy);
  assert.deepEqual(out, ['a', 'A', 'á', 'b']);
  const x = 'Việt';
  const y = NFD('Việt');
  assert.equal(sortVi([y, x])[0], y);
  assert.equal(sortVi([x, y])[0], x);
  assert.deepEqual(sortVi([y, x, 'Viet']).map((s) => s.normalize('NFC')), ['Viet', 'Việt', 'Việt']);
  assert.deepEqual(sortVi([]), []);
});

test('[SPEC:437] sortVi lỗi đầu vào', () => {
  assert.throws(() => sortVi('abc'), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(null), code('SLUG_INVALID_INPUT'));
  assert.throws(() => sortVi(['a', 1]), code('SLUG_INVALID_INPUT'));
});
