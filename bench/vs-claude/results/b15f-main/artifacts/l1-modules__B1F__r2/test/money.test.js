import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const vnd = (minor) => ({ minor, currency: 'VND' });
const code = (c) => (e) => e && e.code === c;
const minors = (arr) => arr.map((p) => p.minor);

test('parse và format USD theo en-US', () => {
  assert.deepEqual(parseMoney('$1,234.56'), { minor: 123456, currency: 'USD' });
  assert.equal(formatMoney({ minor: 123456, currency: 'USD' }), '$1,234.56');
});

test('format VND theo vi-VN', () => {
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }, { locale: 'vi-VN' }), '1.234.567 ₫');
});

test('allocate không mất xu', () => {
  const parts = allocate({ minor: 1000, currency: 'USD' }, [1, 1, 1]);
  assert.deepEqual(parts.map((p) => p.minor), [334, 333, 333]);
});

test('convert làm tròn half-even một lần ở cuối', () => {
  const rates = { USD: { VND: '25000.5' } };
  assert.deepEqual(convert({ minor: 100, currency: 'USD' }, 'VND', rates), { minor: 25000, currency: 'VND' });
});

test('money: kiểm currency trước, minor sau, không -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven: biên half-even', () => {
  assert.equal(divideRoundHalfEven(5, 2), 2);
  assert.equal(divideRoundHalfEven(7, 2), 4);
  assert.equal(divideRoundHalfEven(-5, 2), -2);
  assert.equal(divideRoundHalfEven(-7, 2), -4);
  assert.equal(divideRoundHalfEven(10, 4), 2);
  assert.equal(divideRoundHalfEven(14, 4), 4);
  assert.equal(divideRoundHalfEven(2, 3), 1);
  assert.equal(divideRoundHalfEven(5, -2), -2);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: các ví dụ trong SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), vnd(1234567));
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parseMoney: dấu, token, khoảng trắng', () => {
  assert.deepEqual(parseMoney('  - $5  '), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('5 eur'), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('1234567.5', { currency: 'USD' }), usd(123456750));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  assert.throws(() => parseMoney('$-5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5-', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('(-5)', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('£5', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: cú pháp số theo locale', () => {
  for (const bad of ['.5', '5.', '1e3', '1,23,456', '1,2345', '1 234', '12345,678']) {
    assert.throws(() => parseMoney(bad, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.deepEqual(parseMoney('1234,5', { locale: 'fr-FR', currency: 'EUR' }), { minor: 123450, currency: 'EUR' });
  assert.throws(() => parseMoney(',5', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1 234', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('1 234', { locale: 'fr-FR', currency: 'USD' }), usd(123400));
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.ok(Object.is(parseMoney('-0.4', { currency: 'VND' }).minor, 0));
});

test('parseMoney: mã lỗi và thứ tự kiểm', () => {
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP abc'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992', { currency: 'VND' }), code('MONEY_INVALID_AMOUNT'));
  assert.equal(parseMoney('9007199254740991', { currency: 'VND' }).minor, 9007199254740991);
});

test('formatMoney: ba locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney(vnd(1234567)), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 500, currency: 'EUR' }, { locale: 'fr-FR' }), '5,00 €');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(500), { negative: 'parens' }), '$5.00');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('parse(format(m)) là đồng nhất', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of [usd(0), usd(-1), usd(123456789), vnd(-1234567), { minor: 99, currency: 'EUR' }]) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  const a = usd(1);
  assert.notEqual(add(a, usd(0)), a);
  assert.throws(() => add(usd(1), vnd(1)), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), vnd(1)), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), vnd(1)), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(5, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, usd(1)), code('MONEY_INVALID_CURRENCY'));
});

test('multiply: ví dụ SPEC và lỗi', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  assert.equal(multiply(usd(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(usd(1), '-0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ SPEC', () => {
  assert.deepEqual(minors(allocate(usd(10), [1, 3])), [2, 8]);
  assert.deepEqual(minors(allocate(usd(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(minors(allocate(usd(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(minors(allocate(usd(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(minors(allocate(usd(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(minors(allocate(usd(-10), [1, 3])), [-2, -8]);
});

test('allocate: tổng bảo toàn, -0, tiền tệ, số lớn', () => {
  const parts = allocate(vnd(-1), [0, 1, 0]);
  assert.deepEqual(minors(parts), [0, -1, 0]);
  assert.ok(parts.every((p) => !Object.is(p.minor, -0) && p.currency === 'VND'));
  const big = allocate(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1, 7]);
  assert.equal(big.reduce((s, p) => s + p.minor, 0), Number.MAX_SAFE_INTEGER);
  assert.deepEqual(minors(allocate(usd(0), [1, 2])), [0, 0]);
});

test('allocate: ratios không hợp lệ', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], null, 'ab', [Infinity]]) {
    assert.throws(() => allocate(usd(10), bad), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(null, [1]), code('MONEY_INVALID_AMOUNT'));
});

const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('convert: ví dụ SPEC', () => {
  assert.deepEqual(convert(usd(300), 'VND', rates), vnd(75002));
  assert.deepEqual(convert(usd(1), 'VND', rates), vnd(250));
  assert.deepEqual(convert(usd(1000), 'EUR', rates), { minor: 920, currency: 'EUR' });
  assert.deepEqual(convert(usd(5), 'EUR', rates), { minor: 5, currency: 'EUR' });
  assert.deepEqual(convert(vnd(1000000), 'USD', rates), usd(4000));
  assert.deepEqual(convert(vnd(1), 'USD', rates), usd(0));
  assert.deepEqual(convert(usd(-300), 'VND', rates), vnd(-75002));
  assert.ok(Object.is(convert(vnd(-1), 'USD', rates).minor, 0));
});

test('convert: cùng loại tiền trả bản sao, không đọc rates', () => {
  const m = usd(5);
  const r = convert(m, 'USD', null);
  assert.deepEqual(r, m);
  assert.notEqual(r, m);
});

test('convert: lỗi', () => {
  assert.throws(() => convert(usd(1), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(vnd(1), 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '']) {
    assert.throws(() => convert(usd(1), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convert không tự nghịch đảo hay qua trung gian', () => {
  assert.throws(() => convert(vnd(27000), 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'EUR' }, 'VND', { EUR: { USD: '1' }, USD: { VND: '1' } }), code('MONEY_MISSING_RATE'));
});

test('convertSum: đổi và làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), vnd(75000));
  assert.deepEqual(convertSum([usd(100), vnd(5), { minor: 1, currency: 'EUR' }], 'VND', rates), vnd(25000 + 5 + 270));
  assert.deepEqual(convertSum([usd(1)], 'USD', null), usd(1));
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convertSum([usd(Number.MAX_SAFE_INTEGER), usd(1)], 'USD', rates), code('MONEY_INVALID_AMOUNT'));
});
