import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const M = (minor, currency = 'USD') => ({ minor, currency });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => {
    assert.equal(e.code, code);
    return true;
  });
const minors = (list) => list.map((x) => x.minor);

// ── money()
test('money: tạo giá trị và chuẩn hóa -0', () => {
  assert.deepStrictEqual(money(500, 'USD'), M(500));
  const z = money(-0, 'VND');
  assert.ok(Object.is(z.minor, 0));
});
test('money: lỗi loại tiền và số tiền', () => {
  throwsCode(() => money(5, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('5', 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
});

// ── parseMoney
const parseOk = [
  ['en-US có ký hiệu và nhóm nghìn', '$1,234.56', {}, M(123456)],
  ['en-US số trần kèm currency', '1234.5', { currency: 'USD' }, M(123450)],
  ['dấu âm đứng đầu', '-$5.00', {}, M(-500)],
  ['dấu dương đứng đầu', '+$5', {}, M(500)],
  ['ngoặc kế toán là số âm', '($5.00)', {}, M(-500)],
  ['dấu cách sau dấu âm', '- $5.00', {}, M(-500)],
  ['mã loại tiền đứng trước, không phân biệt hoa thường', 'usd 5.00', {}, M(500)],
  ['mã đứng sau', '5.00 EUR', {}, M(500, 'EUR')],
  ['ký hiệu đứng sau ở en-US', '5.00$', {}, M(500)],
  ['VND en-US', '₫1,000', {}, M(1000, 'VND')],
  ['vi-VN VND', '1.234.567 ₫', { locale: 'vi-VN' }, M(1234567, 'VND')],
  ['vi-VN USD', '1.234,56 $', { locale: 'vi-VN' }, M(123456)],
  ['vi-VN: dấu phẩy là thập phân', '1,234', { locale: 'vi-VN', currency: 'USD' }, M(123)],
  ['vi-VN: dấu chấm là nghìn', '1.234', { locale: 'vi-VN', currency: 'VND' }, M(1234, 'VND')],
  ['fr-FR nhóm nghìn bằng dấu cách', '1 234,56 €', { locale: 'fr-FR' }, M(123456, 'EUR')],
  ['âm ở fr-FR', '-1 234,56 €', { locale: 'fr-FR' }, M(-123456, 'EUR')],
];
const parseGroups = [['dấu và ký hiệu ở en-US', 0, 6], ['mã loại tiền, VND', 6, 10], ['vi-VN và fr-FR', 10, 16]];
for (const [title, from, to] of parseGroups) {
  test(`parseMoney: ${title}`, () => {
    for (const [name, text, opts, want] of parseOk.slice(from, to)) assert.deepStrictEqual(parseMoney(text, opts), want, name);
  });
}

test('parseMoney: half-even trên chuỗi thập phân (USD)', () => {
  const cases = [['1.005', 100], ['1.015', 102], ['1.025', 102], ['1.0051', 101], ['0.005', 0], ['0.015', 2], ['-0.015', -2], ['2.675', 268]];
  for (const [text, minor] of cases) assert.equal(parseMoney(text, { currency: 'USD' }).minor, minor, text);
});
test('parseMoney: half-even với VND và không ra -0', () => {
  const cases = [['0.5', 0], ['1.5', 2], ['2.5', 2], ['3.5', 4], ['2.51', 3], ['-2.5', -2], ['-0.5', 0]];
  for (const [text, minor] of cases) {
    const r = parseMoney(text, { currency: 'VND' });
    assert.equal(r.minor, minor, text);
    assert.ok(!Object.is(r.minor, -0), text);
  }
});
test('parseMoney: cú pháp số tiền sai → MONEY_INVALID_AMOUNT', () => {
  const bads = ['', '   ', '5.', '.5', '1,23', '1,2345', '1 234', '--5', '$-5', '5-', '$5 €', '(-5)', '1e3', 'abc', '£5', '$'];
  for (const text of bads) throwsCode(() => parseMoney(text, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney(12, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney(undefined), 'MONEY_INVALID_AMOUNT');
});
test('parseMoney: số quá lớn → MONEY_INVALID_AMOUNT', () => {
  assert.equal(parseMoney('9007199254740991', { currency: 'VND' }).minor, 9007199254740991);
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
});
test('parseMoney: lỗi loại tiền và locale', () => {
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('$5', { locale: 'xx-XX' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney('abc', { locale: 'xx-XX' }), 'MONEY_INVALID_LOCALE');
});

// ── formatMoney
const fmtCases = [
  [M(123456), {}, '$1,234.56'],
  [M(123456), { locale: 'vi-VN' }, '1.234,56 $'],
  [M(123456), { locale: 'fr-FR' }, '1 234,56 $'],
  [M(123456, 'EUR'), { locale: 'fr-FR' }, '1 234,56 €'],
  [M(123456, 'EUR'), {}, '€1,234.56'],
  [M(1234567, 'VND'), { locale: 'vi-VN' }, '1.234.567 ₫'],
  [M(1234567, 'VND'), {}, '₫1,234,567'],
  [M(1234567, 'VND'), { locale: 'fr-FR' }, '1 234 567 ₫'],
  [M(-500), {}, '-$5.00'],
  [M(-500), { locale: 'vi-VN' }, '-5,00 $'],
  [M(-500), { negative: 'parens' }, '($5.00)'],
  [M(-500), { locale: 'vi-VN', negative: 'parens' }, '(5,00 $)'],
  [M(500), { negative: 'parens' }, '$5.00'],
  [M(500), { display: 'code' }, 'USD 5.00'],
  [M(-500), { display: 'code' }, '-USD 5.00'],
  [M(500, 'EUR'), { display: 'code', locale: 'vi-VN' }, '5,00 EUR'],
  [M(-1234567, 'VND'), { display: 'none', locale: 'vi-VN' }, '-1.234.567'],
  [M(123456), { display: 'none' }, '1,234.56'],
  [M(0), {}, '$0.00'],
  [M(5), {}, '$0.05'],
  [M(99999999), {}, '$999,999.99'],
  [M(999, 'VND'), { locale: 'vi-VN' }, '999 ₫'],
  [M(1000, 'VND'), { locale: 'vi-VN' }, '1.000 ₫'],
];
const fmtGroups = [['số dương theo locale', 0, 8], ['số âm', 8, 13], ['display code và none', 13, 18], ['số nhỏ, số 0, nhóm nghìn', 18, 23]];
for (const [title, from, to] of fmtGroups) {
  test(`formatMoney: ${title}`, () => {
    for (const [m, opts, want] of fmtCases.slice(from, to)) assert.equal(formatMoney(m, opts), want, want);
  });
}
test('formatMoney: parse(format(m)) khớp m ở mọi locale', () => {
  const values = [M(0), M(5), M(-5), M(100), M(123456), M(-98765432), M(0, 'VND'), M(1000, 'VND'), M(-1234567, 'VND'), M(7777777, 'EUR')];
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of values) {
        assert.deepStrictEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m, `${locale} ${display} ${m.minor}`);
      }
    }
  }
});
test('formatMoney: lỗi đầu vào và tùy chọn', () => {
  throwsCode(() => formatMoney(M(5, 'GBP')), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney(M(1.5)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney(M(5), { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(M(5), { display: 'long' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(M(5), { negative: 'minus' }), 'MONEY_INVALID_OPTION');
});

// ── add / subtract / compare
test('add, subtract, compare', () => {
  assert.deepStrictEqual(add(M(500), M(7)), M(507));
  assert.deepStrictEqual(subtract(M(500), M(700)), M(-200));
  assert.deepStrictEqual(subtract(M(500, 'EUR'), M(500, 'EUR')), M(0, 'EUR'));
  assert.ok(!Object.is(subtract(M(5), M(5)).minor, -0));
  assert.equal(compare(M(1), M(2)), -1);
  assert.equal(compare(M(2), M(2)), 0);
  assert.equal(compare(M(3), M(2)), 1);
});
test('add/subtract/compare: khác loại tiền và tràn số', () => {
  throwsCode(() => add(M(1), M(1, 'EUR')), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(M(1), M(1, 'VND')), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(M(1), M(1, 'EUR')), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(M(Number.MAX_SAFE_INTEGER), M(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(M(1.5), M(1)), 'MONEY_INVALID_AMOUNT');
});

// ── divideRoundHalfEven
test('divideRoundHalfEven: các trường hợp half-even', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [5, -2, -2], [1, 3, 0], [2, 3, 1], [10, 4, 2], [14, 4, 4], [-14, 4, -4], [6, 3, 2], [0, 5, 0]];
  for (const [n, d, want] of cases) assert.equal(divideRoundHalfEven(n, d), want, `${n}/${d}`);
});
test('divideRoundHalfEven: không ra -0, chính xác với số lớn, lỗi', () => {
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 3), 3002399751580330);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, NaN), 'MONEY_INVALID_AMOUNT');
});

// ── multiply
test('multiply: làm tròn half-even một lần', () => {
  assert.deepStrictEqual(multiply(M(1005), '0.08'), M(80));
  assert.deepStrictEqual(multiply(M(250), '0.01'), M(2));
  assert.deepStrictEqual(multiply(M(350), '0.01'), M(4));
  assert.deepStrictEqual(multiply(M(1005), '1.1'), M(1106));
  assert.deepStrictEqual(multiply(M(-1005), '1.1'), M(-1106));
  assert.deepStrictEqual(multiply(M(100), '-2'), M(-200));
  assert.deepStrictEqual(multiply(M(1001, 'VND'), '0.5'), M(500, 'VND'));
  assert.deepStrictEqual(multiply(M(1), '0.4'), M(0));
  assert.ok(!Object.is(multiply(M(-1), '0.4').minor, -0));
});
test('multiply: hệ số sai → MONEY_INVALID_RATE', () => {
  for (const f of [0.5, '', 'abc', '1e2', '.5', '5.', '+1', ' 1', null]) throwsCode(() => multiply(M(100), f), 'MONEY_INVALID_RATE');
  throwsCode(() => multiply(M(100, 'GBP'), '1'), 'MONEY_INVALID_CURRENCY');
});

// ── allocate
test('allocate: chia đều', () => {
  assert.deepStrictEqual(minors(allocate(M(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepStrictEqual(minors(allocate(M(100), [2, 2, 2])), [34, 33, 33]);
  assert.deepStrictEqual(minors(allocate(M(100), [1, 1, 1, 1, 1, 1, 1])), [15, 15, 14, 14, 14, 14, 14]);
});
test('allocate: phần dư theo tỉ lệ lớn nhất (khác t2)', () => {
  assert.deepStrictEqual(minors(allocate(M(10), [1, 3])), [2, 8]);
  assert.deepStrictEqual(minors(allocate(M(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepStrictEqual(minors(allocate(M(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepStrictEqual(minors(allocate(M(10), [1, 1, 2])), [2, 2, 6]);
});
test('allocate: tỉ lệ bằng 0 không nhận gì', () => {
  assert.deepStrictEqual(minors(allocate(M(1), [0, 0, 5])), [0, 0, 1]);
  assert.deepStrictEqual(minors(allocate(M(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepStrictEqual(minors(allocate(M(9), [0, 3])), [0, 9]);
});
test('allocate: số âm, số 0, một phần tử, loại tiền', () => {
  assert.deepStrictEqual(minors(allocate(M(-10), [1, 3])), [-2, -8]);
  const zero = allocate(M(0), [1, 2]);
  assert.deepStrictEqual(minors(zero), [0, 0]);
  assert.ok(zero.every((p) => !Object.is(p.minor, -0)));
  assert.deepStrictEqual(allocate(M(123), [5]), [M(123)]);
  assert.deepStrictEqual(allocate(M(100001, 'VND'), [1, 1]), [M(50001, 'VND'), M(50000, 'VND')]);
});
test('allocate: tổng luôn bằng số tiền gốc', () => {
  const ratioSets = [[1, 1, 1], [3, 7], [1, 2, 3, 4, 5], [13, 0, 29, 1], [999, 1], [5, 5, 5, 5, 5, 5, 5]];
  for (const amount of [1, 2, 99, 100, 101, 12345, -12345, 9007199254740991]) {
    for (const ratios of ratioSets) {
      const parts = allocate(M(amount), ratios);
      assert.equal(parts.length, ratios.length);
      assert.equal(parts.reduce((s, p) => s + p.minor, 0), amount, `${amount} ${ratios}`);
      parts.forEach((p, i) => { if (ratios[i] === 0) assert.equal(p.minor, 0); });
    }
  }
});
test('allocate: ratios sai → MONEY_INVALID_RATIO', () => {
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'abc', null, [1, NaN], [1, Infinity], [1, '2']]) {
    throwsCode(() => allocate(M(100), r), 'MONEY_INVALID_RATIO');
  }
  throwsCode(() => allocate(M(1.5), [1]), 'MONEY_INVALID_AMOUNT');
});

// ── convert / convertSum
const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
test('convert: half-even một lần ở cuối (USD → VND)', () => {
  assert.deepStrictEqual(convert(M(100), 'VND', rates), M(25000, 'VND'));
  assert.deepStrictEqual(convert(M(300), 'VND', rates), M(75002, 'VND'));
  assert.deepStrictEqual(convert(M(1), 'VND', rates), M(250, 'VND'));
  assert.deepStrictEqual(convert(M(-300), 'VND', rates), M(-75002, 'VND'));
});
test('convert: giữa các loại tiền hai chữ số thập phân', () => {
  assert.deepStrictEqual(convert(M(1000), 'EUR', rates), M(920, 'EUR'));
  assert.deepStrictEqual(convert(M(125), 'EUR', rates), M(115, 'EUR'));
  assert.deepStrictEqual(convert(M(5), 'EUR', rates), M(5, 'EUR'));
  assert.deepStrictEqual(convert(M(100, 'EUR'), 'USD', rates), M(109));
  assert.deepStrictEqual(convert(M(100, 'EUR'), 'VND', rates), M(27000, 'VND'));
});
test('convert: nguồn VND và kết quả nhỏ', () => {
  assert.deepStrictEqual(convert(M(1000000, 'VND'), 'USD', rates), M(4000));
  assert.deepStrictEqual(convert(M(12500, 'VND'), 'USD', rates), M(50));
  assert.deepStrictEqual(convert(M(1, 'VND'), 'USD', rates), M(0));
  assert.ok(!Object.is(convert(M(-1, 'VND'), 'USD', rates).minor, -0));
});
test('convert: nửa đúng về số chẵn', () => {
  const half = { USD: { EUR: '0.5' } };
  assert.equal(convert(M(5), 'EUR', half).minor, 2);
  assert.equal(convert(M(7), 'EUR', half).minor, 4);
  assert.equal(convert(M(-5), 'EUR', half).minor, -2);
  assert.equal(convert(M(-7), 'EUR', half).minor, -4);
});
test('convert: cùng loại tiền trả bản sao, không đọc rates', () => {
  const src = M(123);
  const out = convert(src, 'USD', {});
  assert.deepStrictEqual(out, M(123));
  assert.notEqual(out, src);
  assert.deepStrictEqual(convert(src, 'USD', null), M(123));
});
test('convert: thiếu hoặc sai tỉ giá', () => {
  throwsCode(() => convert(M(1), 'EUR', { USD: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(M(1), 'EUR', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(M(1, 'VND'), 'EUR', rates), 'MONEY_MISSING_RATE');
  for (const bad of ['0', '0.0', 'abc', 25000, '-1', '.5', '1e3', null]) {
    throwsCode(() => convert(M(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(M(1), 'VND', null), 'MONEY_INVALID_RATE');
});
test('convert: loại tiền đích sai', () => {
  throwsCode(() => convert(M(1), 'GBP', rates), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(M(1, 'GBP'), 'USD', rates), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(M(1.5), 'VND', rates), 'MONEY_INVALID_AMOUNT');
});
test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepStrictEqual(convertSum([M(100), M(100), M(100)], 'VND', rates), M(75000, 'VND'));
  assert.deepStrictEqual(convert(M(300), 'VND', rates), M(75002, 'VND'));
  assert.deepStrictEqual(convertSum([M(100), M(100, 'EUR')], 'VND', rates), M(52000, 'VND'));
  assert.deepStrictEqual(convertSum([M(500, 'VND'), M(100)], 'VND', rates), M(25500, 'VND'));
});
test('convertSum: danh sách sai', () => {
  throwsCode(() => convertSum([], 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([M(1)], 'GBP', rates), 'MONEY_INVALID_CURRENCY');
});
