import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money', () => {
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.equal(code(() => money(1, 'GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney ví dụ', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
});

test('parseMoney làm tròn half-even', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney lỗi', () => {
  assert.equal(code(() => parseMoney('$-5')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('5-')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('(-5) $')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('(-$5)')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('$5 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('.5 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('5. USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('1e3 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('1,23,456 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('£5')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('$5', { currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => parseMoney('$5', { locale: 'de' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { locale: 'de' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { currency: 'X' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney(5)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('9007199254740992 VND')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('1 234 USD')), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(123456), { display: 'none', locale: 'vi-VN' }), '1.234,56');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
  assert.equal(code(() => formatMoney(usd(1), { locale: 'x' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => formatMoney(usd(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(usd(1), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(null)), 'MONEY_INVALID_AMOUNT');
});

test('format/parse round trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 5, -5, 99, 100, 123456789, -123456789, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
        for (const display of ['symbol', 'code']) {
          for (const negative of ['sign', 'parens']) {
            const m = { minor, currency };
            assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative }), { locale }), m);
          }
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.equal(code(() => add(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => compare(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => add(usd(1.5), usd(1))), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(code(() => divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => divideRoundHalfEven(1.5, 2)), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(1005), '-1').minor, -1005);
  for (const f of [1.5, '1e2', '.5', '5.', '+1', '']) {
    assert.equal(code(() => multiply(usd(1), f)), 'MONEY_INVALID_RATE');
  }
});

test('allocate', () => {
  const a = (minor, r) => allocate(usd(minor), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(allocate(usd(-1), [0, 1]).every((x) => !Object.is(x.minor, -0)));
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2']]) {
    assert.equal(code(() => allocate(usd(5), r)), 'MONEY_INVALID_RATIO');
  }
});

test('convert', () => {
  const c = (minor, to, from = 'USD') => convert({ minor, currency: from }, to, rates).minor;
  assert.equal(c(100, 'VND'), 25000);
  assert.equal(c(300, 'VND'), 75002);
  assert.equal(c(1, 'VND'), 250);
  assert.equal(c(1000, 'EUR'), 920);
  assert.equal(c(5, 'EUR'), 5);
  assert.equal(c(1000000, 'USD', 'VND'), 4000);
  assert.equal(c(1, 'USD', 'VND'), 0);
  assert.equal(c(-300, 'VND'), -75002);
  assert.equal(code(() => c(1, 'EUR', 'VND')), 'MONEY_MISSING_RATE');
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5));
  assert.equal(code(() => convert(usd(5), 'XXX', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => convert(usd(5), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(usd(5), 'VND', { USD: { VND: 5 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(usd(5), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(usd(5), 'VND', { USD: { VND: '-1' } })), 'MONEY_INVALID_RATE');
});

test('convertSum', () => {
  assert.equal(convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  assert.equal(convertSum([usd(100), { minor: 1000, currency: 'VND' }], 'VND', rates).minor, 26000);
  assert.equal(code(() => convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
