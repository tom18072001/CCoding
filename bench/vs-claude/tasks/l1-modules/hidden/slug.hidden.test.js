import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, slugify, uniqueSlug, looseEquals, looseIncludes, compareVi, sortVi } from '../src/slug/index.js';

function code(c) {
  return (e) => e instanceof Error && e.code === c;
}
const INPUT = code('SLUG_INVALID_INPUT');
const MAXLEN = code('SLUG_INVALID_MAXLENGTH');

// ---- slugify: cơ bản
test('slugify: câu tiếng Việt có dấu', () => {
  assert.equal(slugify('Xin chào Việt Nam'), 'xin-chao-viet-nam');
});
test('slugify: đ và Đ thành d', () => {
  assert.equal(slugify('Đường Đồng Khởi'), 'duong-dong-khoi');
  assert.equal(slugify('đ Đ'), 'd-d');
});
test('slugify: chữ hoa toàn bộ', () => {
  assert.equal(slugify('ĐÀ NẴNG'), 'da-nang');
  assert.equal(slugify('ABC Def'), 'abc-def');
});
test('slugify: dạng NFD cho kết quả như NFC', () => {
  const nfc = 'Việt Nam – Hương Thư';
  assert.equal(slugify(nfc.normalize('NFD')), slugify(nfc.normalize('NFC')));
  assert.equal(slugify('Việt'), 'viet');
  assert.equal(slugify('Hượng'.normalize('NFD')), 'huong');
});
test('slugify: ơ, ư, ă, â, ê, ô', () => {
  assert.equal(slugify('Hương Thư Ơ Ắ Ầ Ế Ổ'), 'huong-thu-o-a-a-e-o');
});
test('slugify: gộp phân cách liên tiếp, bỏ đầu cuối', () => {
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('--a--b--'), 'a-b');
  assert.equal(slugify('a - _ . b'), 'a-b');
});
test('slugify: chữ số và dấu gạch chéo', () => {
  assert.equal(slugify('Phòng 101/B2'), 'phong-101-b2');
  assert.equal(slugify('file_name.v2'), 'file-name-v2');
});
test('slugify: không còn chữ nào thì rỗng', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
  assert.equal(slugify('日本語'), '');
});
test('slugify: chữ không phải ASCII sau khi bỏ dấu là phân cách', () => {
  assert.equal(slugify('abc 日本 def'), 'abc-def');
  assert.equal(slugify('Straße'), 'stra-e');
});
test('slugify: idempotent', () => {
  for (const s of ['Xin chào Việt Nam', '  Đại học Bách Khoa  ', 'a__b', '100% Việt!']) {
    assert.equal(slugify(slugify(s)), slugify(s));
  }
});
test('slugify: options rỗng hoặc không có', () => {
  assert.equal(slugify('A b', {}), 'a-b');
  assert.equal(slugify('A b', undefined), 'a-b');
});
test('slugify: đầu vào sai kiểu', () => {
  for (const v of [null, undefined, 5, {}, ['a']]) assert.throws(() => slugify(v), INPUT);
});

// ---- slugify: maxLength
test('slugify maxLength: không cắt giữa từ', () => {
  const s = 'xin chao viet nam';
  assert.equal(slugify(s, { maxLength: 12 }), 'xin-chao');
  assert.equal(slugify(s, { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(slugify(s, { maxLength: 17 }), 'xin-chao-viet-nam');
  assert.equal(slugify(s, { maxLength: 100 }), 'xin-chao-viet-nam');
});
test('slugify maxLength: từ đầu quá dài thì cắt cứng', () => {
  assert.equal(slugify('extraordinary day', { maxLength: 5 }), 'extra');
  assert.equal(slugify('abc defghij', { maxLength: 2 }), 'ab');
  assert.equal(slugify('Nghiêng', { maxLength: 4 }), 'nghi');
});
test('slugify maxLength: nhỏ nhất và biên', () => {
  assert.equal(slugify('a b c', { maxLength: 1 }), 'a');
  assert.equal(slugify('a b c', { maxLength: 3 }), 'a-b');
  assert.equal(slugify('a b c', { maxLength: 4 }), 'a-b');
  assert.equal(slugify('ab cd', { maxLength: 2 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab');
  assert.equal(slugify('ab cd', { maxLength: 5 }), 'ab-cd');
});
test('slugify maxLength: kết quả không kết thúc bằng gạch ngang', () => {
  for (let m = 1; m <= 20; m++) {
    const r = slugify('Đại học Quốc gia Hà Nội', { maxLength: m });
    assert.ok(r.length <= m && !r.endsWith('-') && !r.startsWith('-'), `m=${m} r=${r}`);
  }
});
test('slugify maxLength: không hợp lệ', () => {
  for (const m of [0, -1, 1.5, '5', NaN, Infinity, null]) {
    assert.throws(() => slugify('abc', { maxLength: m }), MAXLEN);
  }
  assert.throws(() => slugify('', { maxLength: 0 }), MAXLEN);
});

// ---- fold
test('fold: bỏ dấu và giữ hoa/thường', () => {
  assert.equal(fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(fold('đ'), 'd');
});
test('fold: NFD và NFC như nhau, giữ ký tự khác', () => {
  assert.equal(fold('Nguyễn'.normalize('NFD')), 'Nguyen');
  assert.equal(fold('Nguyễn'.normalize('NFC')), 'Nguyen');
  assert.equal(fold('abc 123 !?'), 'abc 123 !?');
});
test('fold: sai kiểu', () => {
  assert.throws(() => fold(null), INPUT);
  assert.throws(() => fold(12), INPUT);
});

// ---- uniqueSlug
test('uniqueSlug: thêm hậu tố -2, -3', () => {
  assert.equal(uniqueSlug('abc', []), 'abc');
  assert.equal(uniqueSlug('abc', ['abc']), 'abc-2');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-3']), 'abc-2');
});
test('uniqueSlug: Set, không sửa existing, base có số', () => {
  const s = new Set(['abc-2']);
  assert.equal(uniqueSlug('abc-2', s), 'abc-2-2');
  assert.deepEqual([...s], ['abc-2']);
  const a = ['x'];
  uniqueSlug('x', a);
  assert.deepEqual(a, ['x']);
});
test('uniqueSlug: đầu vào sai', () => {
  assert.throws(() => uniqueSlug('', []), INPUT);
  assert.throws(() => uniqueSlug(5, []), INPUT);
  assert.throws(() => uniqueSlug('a', 'a'), INPUT);
  assert.throws(() => uniqueSlug('a', null), INPUT);
});

// ---- so khớp không dấu
test('looseEquals: không dấu, không phân biệt hoa/thường', () => {
  assert.equal(looseEquals('Nguyễn', 'nguyen'), true);
  assert.equal(looseEquals('Đà Nẵng', 'DA NANG'), true);
  assert.equal(looseEquals('đ', 'd'), true);
  assert.equal(looseEquals('a', 'b'), false);
});
test('looseEquals: gộp khoảng trắng, bỏ khoảng trắng đầu cuối', () => {
  assert.equal(looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(looseEquals('da\t\nnang', ' da nang'), true);
  assert.equal(looseEquals('danang', 'da nang'), false);
});
test('looseIncludes: chuỗi con không dấu', () => {
  assert.equal(looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(looseIncludes('HÀ NỘI', 'noi'), true);
  assert.equal(looseIncludes('Hà Nội', 'xyz'), false);
  assert.equal(looseIncludes('Hà Nội', ''), true);
  assert.equal(looseIncludes('Hà   Nội', 'ha noi'), true);
});
test('loose*: sai kiểu', () => {
  assert.throws(() => looseEquals('a', null), INPUT);
  assert.throws(() => looseEquals(1, 'a'), INPUT);
  assert.throws(() => looseIncludes(undefined, 'a'), INPUT);
  assert.throws(() => looseIncludes('a', 2), INPUT);
});

// ---- compareVi / sortVi
test('compareVi: thứ tự bảng chữ cái tiếng Việt', () => {
  const letters = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y'];
  for (let i = 0; i < letters.length; i++) {
    for (let j = 0; j < letters.length; j++) {
      assert.equal(compareVi(letters[i], letters[j]), Math.sign(i - j), `${letters[i]} vs ${letters[j]}`);
    }
  }
});
test('compareVi: sortVi xếp đảo chuỗi chữ cái', () => {
  const sorted = ['a', 'ă', 'â', 'b', 'c', 'd', 'đ', 'e', 'ê', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'ô', 'ơ', 'p', 'q', 'r', 's', 't', 'u', 'ư', 'v', 'x', 'y'];
  const shuffled = [...sorted].reverse();
  assert.deepEqual(sortVi(shuffled), sorted);
});
test('compareVi: chữ ngoại lai f j w z sau y', () => {
  assert.deepEqual(sortVi(['z', 'f', 'y', 'w', 'j']), ['y', 'f', 'j', 'w', 'z']);
});
test('compareVi: thứ tự thanh điệu', () => {
  assert.deepEqual(sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  assert.equal(compareVi('bàn', 'bán'), -1);
  assert.equal(compareVi('bán', 'bạn'), -1);
  assert.equal(compareVi('ban', 'bàn'), -1);
});
test('compareVi: chữ cái gốc thắng thanh điệu', () => {
  assert.equal(compareVi('ạ', 'b'), -1);
  assert.equal(compareVi('ặ', 'ấ'), -1);
  assert.equal(compareVi('ấ', 'ặ'), 1);
  assert.equal(compareVi('ế', 'ê'), 1);
  assert.equal(compareVi('ệ', 'f'), -1);
});
test('compareVi: tiền tố ngắn đứng trước, vị trí đầu quyết định thanh điệu', () => {
  assert.equal(compareVi('an', 'anh'), -1);
  assert.equal(compareVi('', 'a'), -1);
  assert.equal(compareVi('bà bá', 'bá bà'), -1);
  assert.equal(compareVi('bà bá', 'bà bà'), 1);
  assert.equal(compareVi('ạn', 'ab'), 1);
});
test('compareVi: hoa/thường là mức cuối', () => {
  assert.equal(compareVi('a', 'A'), -1);
  assert.equal(compareVi('A', 'a'), 1);
  assert.equal(compareVi('A', 'b'), -1);
  assert.equal(compareVi('a', 'Á'), -1);
  assert.equal(compareVi('á', 'A'), 1);
  assert.equal(compareVi('aB', 'Ab'), -1);
  assert.equal(compareVi('ab', 'aB'), -1);
});
test('compareVi: ký tự không phải chữ cái đứng trước chữ cái', () => {
  assert.deepEqual(sortVi(['b', '1', 'a', ' ', '-']), [' ', '-', '1', 'a', 'b']);
  assert.equal(compareVi('a b', 'ab'), -1);
  assert.equal(compareVi('a1', 'aa'), -1);
});
test('compareVi: NFC và NFD bằng nhau, trả đúng -1/0/1', () => {
  assert.equal(compareVi('Việt'.normalize('NFC'), 'Việt'.normalize('NFD')), 0);
  assert.equal(compareVi('x', 'x'), 0);
  const r = compareVi('a', 'z');
  assert.ok(r === -1 || r === 1 || r === 0);
  assert.equal(r, -1);
  assert.equal(compareVi('z', 'a'), 1);
});
test('compareVi: sai kiểu', () => {
  assert.throws(() => compareVi('a', null), INPUT);
  assert.throws(() => compareVi(1, 'a'), INPUT);
});
test('sortVi: danh sách tỉnh thành', () => {
  const input = ['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang', 'Dũng'];
  assert.deepEqual(sortVi(input), ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Dũng', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
});
test('sortVi: mảng mới, ổn định, không sửa đầu vào', () => {
  const nfc = 'á'.normalize('NFC');
  const nfd = 'á'.normalize('NFD');
  const input = [nfd, 'b', nfc, 'a'];
  const out = sortVi(input);
  assert.notEqual(out, input);
  assert.deepEqual(input, [nfd, 'b', nfc, 'a']);
  assert.deepEqual(out, ['a', nfd, nfc, 'b']);
});
test('sortVi: đầu vào sai', () => {
  assert.throws(() => sortVi('abc'), INPUT);
  assert.throws(() => sortVi(null), INPUT);
  assert.throws(() => sortVi(['a', 1]), INPUT);
  assert.deepEqual(sortVi([]), []);
});
