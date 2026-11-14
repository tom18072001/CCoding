import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `kỳ vọng ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

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

test('money: kiểm currency trước, không có -0', () => {
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), U(123456710));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('$1.015').minor, 102);
  assert.equal(parseMoney('$1.0051').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-$1.005').minor, -100);
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
});

test('parseMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => parseMoney(5, { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '$5$', '$5 €', '£5', '', '(-5)', '(+5)', '1,23,456',
    '1,2345', '12,345,67', '1 234.56', '$']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('9007199254740992 VND'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('90071992547409.92 USD'), 'MONEY_INVALID_AMOUNT');
  assert.equal(parseMoney('9007199254740991 VND').minor, 9007199254740991);
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(U(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null, { locale: 'xx' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('parse(format(m)) round-trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
      for (const minor of [0, 5, -5, 99, 100, 123456, -1234567, 9007199254740991, -9007199254740991]) {
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
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(3)), U(-2));
  assert.ok(Object.is(subtract(U(3), U(3)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  throwsCode(() => add(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(1, U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1), 1);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(null, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ và tính chất', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(0), [1, 3]), [0, 0]);
  assert.ok(mins(U(-1), [0, 1]).every((x) => !Object.is(x, -0)));
  assert.ok(allocate(U(5), [1, 1]).every((p) => p.currency === 'USD'));
  const big = mins(U(Number.MAX_SAFE_INTEGER), [3, 5, 7]);
  assert.equal(big.reduce((a, b) => a + b, 0), Number.MAX_SAFE_INTEGER);
});

test('allocate: lỗi tỉ lệ', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], 'x', null]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
});

test('convert: ví dụ đặc tả', () => {
  const c = (m, to) => convert(m, to, RATES);
  assert.equal(c(U(300), 'VND').minor, 75002);
  assert.equal(c(U(1), 'VND').minor, 250);
  assert.equal(c(U(1000), 'EUR').minor, 920);
  assert.equal(c(U(5), 'EUR').minor, 5);
  assert.deepEqual(c({ minor: 1000000, currency: 'VND' }, 'USD'), U(4000));
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD').minor, 0);
  assert.equal(c(U(-300), 'VND').minor, -75002);
});

test('convert: lỗi và quy tắc cặp', () => {
  assert.deepEqual(convert(U(5), 'USD', null), U(5));
  throwsCode(() => convert(U(5), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 5, currency: 'EUR' }, 'USD', { EUR: {} }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(5), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: 25000 } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '0' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '0.0' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '-1' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '1e3' } }), 'MONEY_INVALID_RATE');
});

test('convertSum: làm tròn từng khoản', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.deepEqual(
    convertSum([U(100), { minor: 1000, currency: 'EUR' }], 'VND', RATES),
    { minor: 25000 + 270000, currency: 'VND' },
  );
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
});
