import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code);
const usd = (minor) => ({ minor, currency: 'USD' });
const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };

test('money', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(1, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'GBP'), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('1.005', { currency: 'USD' }), usd(100));
  assert.deepEqual(parseMoney('1.015', { currency: 'USD' }), usd(102));
  assert.deepEqual(parseMoney('1.0051', { currency: 'USD' }), usd(101));
  assert.deepEqual(parseMoney('2.5', { currency: 'VND' }), { minor: 2, currency: 'VND' });
  assert.deepEqual(parseMoney('-3.5', { currency: 'VND' }), { minor: -4, currency: 'VND' });
  assert.ok(Object.is(parseMoney('-0.001', { currency: 'USD' }).minor, 0));
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '£5', '$5$', '1,23,456', '(-$5)', '']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('$5', { locale: 'de' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
  assert.equal(formatMoney(usd(500), { locale: 'vi-VN' }), '5,00 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  throwsCode(() => formatMoney(usd(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(usd(1), { locale: 'x', display: 'x' }), 'MONEY_INVALID_LOCALE');
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of [usd(-123456), usd(0), { minor: 9007199254740991, currency: 'VND' }, { minor: -7, currency: 'EUR' }]) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative: 'parens' }), { locale }), m);
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(1)), usd(0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  throwsCode(() => add(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(null, usd(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, 2, -4]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 1), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  for (const bad of [1, '1e2', '.5', '5.', '']) throwsCode(() => multiply(usd(1), bad), 'MONEY_INVALID_RATE');
});

test('allocate', () => {
  const run = (minor, r) => allocate(usd(minor), r).map((p) => p.minor);
  assert.deepEqual(run(10, [1, 3]), [2, 8]);
  assert.deepEqual(run(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(run(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(run(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(run(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(run(-10, [1, 3]), [-2, -8]);
  assert.ok(Object.is(run(-1, [1, 0])[1], 0));
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x']) throwsCode(() => run(10, bad), 'MONEY_INVALID_RATIO');
});

test('convert / convertSum', () => {
  assert.equal(convert(usd(100), 'VND', rates).minor, 25000);
  assert.equal(convert(usd(300), 'VND', rates).minor, 75002);
  assert.equal(convert(usd(1), 'VND', rates).minor, 250);
  assert.equal(convert(usd(1000), 'EUR', rates).minor, 920);
  assert.equal(convert(usd(5), 'EUR', rates).minor, 5);
  assert.equal(convert({ minor: 1000000, currency: 'VND' }, 'USD', rates).minor, 4000);
  assert.equal(convert({ minor: 1, currency: 'VND' }, 'USD', rates).minor, 0);
  assert.equal(convert(usd(-300), 'VND', rates).minor, -75002);
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5));
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(1), 'VND', { USD: { VND: '0' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', { USD: { VND: 5 } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', 5), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'XXX', rates), 'MONEY_INVALID_CURRENCY');
  assert.equal(convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  throwsCode(() => convertSum([], 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', rates), 'MONEY_INVALID_AMOUNT');
});
