import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: thứ tự kiểm và -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parseMoney: dấu, token, vị trí', () => {
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('-$0'), usd(0));
  assert.ok(Object.is(parseMoney('-$0').minor, 0));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('  5 EUR '), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('5', { currency: 'VND' }), { minor: 5, currency: 'VND' });
  assert.deepEqual(parseMoney('$1234567.5'), usd(123456750));
  for (const bad of ['$-5', '5-', '(-5$)', '(+5$)', '$5$', '$ 5 USD', '£5', '.5$', '$5.', '$1e3', '$1,23', '$1,2345', '$12,34,567', '$1 234', '', '$', '$1,234,56']) {
    assert.throws(() => parseMoney(bad), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 EUR', { currency: 'USD' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { currency: 'USD' }) && parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
});

test('parseMoney: thứ tự lỗi', () => {
  assert.throws(() => parseMoney(5, { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5 GBP junk'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: locale', () => {
  assert.throws(() => parseMoney('1 234,56 €', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('1,234.56 $', { locale: 'en-US' }), usd(123456));
  assert.deepEqual(parseMoney('1.234,56 $', { locale: 'vi-VN' }), usd(123456));
  assert.throws(() => parseMoney('1,234.56 $', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.deepEqual(parseMoney('1.005 USD'), usd(100));
  assert.deepEqual(parseMoney('1.015 USD'), usd(102));
  assert.deepEqual(parseMoney('1.0051 USD'), usd(101));
  assert.deepEqual(parseMoney('-1.005 USD'), usd(-100));
  assert.deepEqual(parseMoney('2.5 VND'), { minor: 2, currency: 'VND' });
  assert.deepEqual(parseMoney('3.5 VND'), { minor: 4, currency: 'VND' });
  assert.deepEqual(parseMoney('(2.5 VND)'), { minor: -2, currency: 'VND' });
});

test('parseMoney: vượt số nguyên an toàn', () => {
  assert.deepEqual(parseMoney('90071992547409.91 USD'), usd(9007199254740991));
  assert.throws(() => parseMoney('90071992547409.92 USD'), code('MONEY_INVALID_AMOUNT'));
});

test('formatMoney', () => {
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }, { locale: 'vi-VN' }), '1.234.567 ₫');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none', locale: 'vi-VN' }), '5,00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'de-DE', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('format/parse round-trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, -1, 99, 100, -123456, 1234567, 9007199254740991, -9007199254740991]) {
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

test('add, subtract, compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(1), usd(1)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => add(usd(1), 5), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(100), '-1.5'), usd(-150));
  assert.ok(Object.is(multiply(usd(1), '-0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply('x', '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const m = (minor) => usd(minor);
  const mins = (x) => x.map((p) => p.minor);
  assert.deepEqual(mins(allocate(m(10), [1, 3])), [2, 8]);
  assert.deepEqual(mins(allocate(m(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(mins(allocate(m(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(mins(allocate(m(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(mins(allocate(m(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(mins(allocate(m(-10), [1, 3])), [-2, -8]);
  assert.ok(allocate(m(-1), [0, 1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1]), [{ minor: 3, currency: 'VND' }]);
  assert.equal(mins(allocate(m(Number.MAX_SAFE_INTEGER), [1, 1, 1])).reduce((a, b) => a + b), Number.MAX_SAFE_INTEGER);
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.throws(() => allocate(m(10), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, rates);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(c(300, 'USD', 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(c(1, 'USD', 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(c(1000, 'USD', 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(c(5, 'USD', 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(c(1000000, 'VND', 'USD'), usd(4000));
  assert.deepEqual(c(1, 'VND', 'USD'), usd(0));
  assert.deepEqual(c(-300, 'USD', 'VND'), { minor: -75002, currency: 'VND' });
  // không nghịch đảo, không trung gian
  assert.throws(() => c(100, 'EUR', 'EUR') && convert(usd(1), 'EUR', { EUR: { USD: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', {}), code('MONEY_MISSING_RATE'));
});

test('convert: cùng loại tiền, lỗi', () => {
  const r = convert(usd(5), 'USD', null);
  assert.deepEqual(r, usd(5));
  assert.throws(() => convert(usd(5), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: 25000 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '0.0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '-1' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '1e3' } }), code('MONEY_INVALID_RATE'));
});

test('convertSum: làm tròn từng khoản', () => {
  const three = [usd(100), usd(100), usd(100)];
  assert.deepEqual(convertSum(three, 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convertSum([usd(1000), { minor: 27000, currency: 'EUR' }], 'VND', { ...rates, EUR: { VND: '27000' } }).currency, 'VND');
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
