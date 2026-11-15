import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, code);
const usd = (minor) => ({ minor, currency: 'USD' });
const vnd = (minor) => ({ minor, currency: 'VND' });
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: hợp lệ, -0, thứ tự lỗi', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parse: ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), vnd(1234567));
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parse: dấu, token, vị trí, lỗi', () => {
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('-5 usd'), usd(-500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('  USD 5  '), usd(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), usd(123456710));
  for (const bad of ['$-5', '5-', '(-$5)', '(+5 USD)', '$5$', 'USD 5 USD', '£5', '.5 USD', '5. USD', '1e3 USD', '1,23 USD', '1,2345 USD', '$', '', '$1 234']) {
    throwsCode(() => parseMoney(bad), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('£5 GBP'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('5', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
});

test('parse: locale phân cách', () => {
  assert.deepEqual(parseMoney('1.234,56 $', { locale: 'vi-VN' }), usd(123456));
  throwsCode(() => parseMoney('1 234 USD', { locale: 'en-US' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1,234.5,6 USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1.2.3 USD', { locale: 'vi-VN' }), 'MONEY_INVALID_AMOUNT');
});

test('parse: half-even trên chuỗi thập phân', () => {
  assert.deepEqual(parseMoney('1.005 USD'), usd(100));
  assert.deepEqual(parseMoney('1.015 USD'), usd(102));
  assert.deepEqual(parseMoney('1.0051 USD'), usd(101));
  assert.deepEqual(parseMoney('2.5 ₫'), vnd(2));
  assert.deepEqual(parseMoney('3.5 ₫'), vnd(4));
  assert.deepEqual(parseMoney('-2.5 ₫'), vnd(-2));
  assert.deepEqual(parseMoney('-3.5 ₫'), vnd(-4));
  assert.ok(Object.is(parseMoney('-0.4 ₫').minor, 0));
});

test('parse: vượt số nguyên an toàn', () => {
  assert.deepEqual(parseMoney('9007199254740991 ₫'), vnd(9007199254740991));
  throwsCode(() => parseMoney('9007199254740992 ₫'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('99999999999999999999 ₫'), 'MONEY_INVALID_AMOUNT');
});

test('format: locale, display, negative', () => {
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
  assert.equal(formatMoney(vnd(1234567)), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 1000, currency: 'EUR' }, { locale: 'fr-FR' }), '10,00 €');
  assert.equal(formatMoney(vnd(1000), { locale: 'vi-VN' }), '1.000 ₫');
});

test('format: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(usd(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(usd(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(null, { locale: 'xx' }), 'MONEY_INVALID_AMOUNT');
});

test('format/parse round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of [usd(0), usd(-1), usd(123456789), vnd(-1234567), vnd(0), { minor: 99, currency: 'EUR' }, vnd(9007199254740991)]) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(1), usd(1)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  throwsCode(() => add(usd(1), vnd(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(usd(1), vnd(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(usd(1), vnd(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(vnd(9007199254740991), vnd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(vnd(-9007199254740991), vnd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(null, usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(usd(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  const a = usd(1);
  assert.notEqual(add(a, usd(0)), a);
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [-1, 3, 0], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(2 ** 53, 1), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(100), '-2'), usd(-200));
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    throwsCode(() => multiply(usd(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(vnd(9007199254740991), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(null, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate', () => {
  const mins = (m, r) => allocate(m, r).map((x) => x.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(allocate(vnd(3), [1, 1]), [vnd(2), vnd(1)]);
  assert.ok(allocate(usd(-1), [0, 1, 0]).every((x) => !Object.is(x.minor, -0)));
  assert.ok(allocate(usd(-5), [1, 0]).every((x) => !Object.is(x.minor, -0)));
  assert.deepEqual(mins(usd(0), [1, 2]), [0, 0]);
  const big = mins(vnd(9007199254740991), [1, 2, 4]);
  assert.equal(big.reduce((a, b) => a + b, 0), 9007199254740991);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'ab', null, [1, '2'], [Number.MAX_SAFE_INTEGER + 1]]) {
    throwsCode(() => allocate(usd(1), bad), 'MONEY_INVALID_RATIO');
  }
});

test('convert: ví dụ SPEC', () => {
  assert.deepEqual(convert(usd(100), 'VND', RATES), vnd(25000));
  assert.deepEqual(convert(usd(300), 'VND', RATES), vnd(75002));
  assert.deepEqual(convert(usd(1), 'VND', RATES), vnd(250));
  assert.deepEqual(convert(usd(1000), 'EUR', RATES), { minor: 920, currency: 'EUR' });
  assert.deepEqual(convert(usd(5), 'EUR', RATES), { minor: 5, currency: 'EUR' });
  assert.deepEqual(convert(vnd(1000000), 'USD', RATES), usd(4000));
  assert.deepEqual(convert(vnd(1), 'USD', RATES), usd(0));
  assert.ok(Object.is(convert(vnd(1), 'USD', RATES).minor, 0));
  assert.deepEqual(convert(usd(-300), 'VND', RATES), vnd(-75002));
});

test('convert: cùng loại, cặp trực tiếp, lỗi', () => {
  const a = usd(5);
  const c = convert(a, 'USD', undefined);
  assert.deepEqual(c, a);
  assert.notEqual(c, a);
  throwsCode(() => convert(vnd(1), 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(vnd(1), 'USD', { USD: { VND: '25000' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(1), 'XXX', null), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(usd(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of ['0', '0.0', 25000, '-1', '1e3', '.5', '5.', '']) {
    throwsCode(() => convert(usd(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(usd(2 ** 52), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convert(null, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
});

test('convertSum', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', RATES), vnd(75000));
  assert.deepEqual(convert(usd(300), 'VND', RATES), vnd(75002));
  assert.deepEqual(convertSum([usd(100), vnd(1000000)], 'USD', RATES), usd(4100));
  assert.deepEqual(convertSum([usd(100)], 'USD', null), usd(100));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([usd(1)], 'XXX', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convertSum([vnd(9007199254740991), vnd(1)], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
});
