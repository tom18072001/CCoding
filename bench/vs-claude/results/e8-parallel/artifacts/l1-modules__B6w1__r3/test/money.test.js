import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (code) => (e) => e.code === code;
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('1234567.5', { currency: 'USD' }), usd(123456750));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney: thứ tự và mã lỗi', () => {
  assert.throws(() => parseMoney(5, { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$-5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5-'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('(-5) $'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('(-$5)'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5$'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$.5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5.'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$1e3'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('£5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$1,23'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$12,34,567'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$1,234'.replace(',', ' ')), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 GBP$'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('9007199254740992 VND'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('9007199254740991 VND'), { minor: 9007199254740991, currency: 'VND' });
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
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
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'de-DE', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('format rồi parse trả lại giá trị cũ', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, -1, 99, 100, 123456, -9007199254740991, 9007199254740991]) {
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

test('add / subtract / compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(undefined, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => add(usd(1), { minor: 1.5, currency: 'EUR' }), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1.5, 0), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(250), '-0.01'), usd(-2));
  assert.ok(Object.is(multiply(usd(1), '-0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', ' 1', '+1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(null, 'x'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(usd(0), [1, 3]), [0, 0]);
  assert.ok(allocate(usd(-1), [0, 1, 0]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate(usd(-1), [1, 1]).every((p) => p.currency === 'USD'));
  const big = mins(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0] + big[1], Number.MAX_SAFE_INTEGER);
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], null]) {
    assert.throws(() => allocate(usd(1), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  assert.deepEqual(convert(usd(100), 'VND', rates), { minor: 25000, currency: 'VND' });
  assert.deepEqual(convert(usd(300), 'VND', rates), { minor: 75002, currency: 'VND' });
  assert.deepEqual(convert(usd(1), 'VND', rates), { minor: 250, currency: 'VND' });
  assert.deepEqual(convert(usd(1000), 'EUR', rates), { minor: 920, currency: 'EUR' });
  assert.deepEqual(convert(usd(5), 'EUR', rates), { minor: 5, currency: 'EUR' });
  assert.deepEqual(convert({ minor: 1000000, currency: 'VND' }, 'USD', rates), usd(4000));
  assert.deepEqual(convert({ minor: 1, currency: 'VND' }, 'USD', rates), usd(0));
  assert.deepEqual(convert(usd(-300), 'VND', rates), { minor: -75002, currency: 'VND' });
});

test('convert: lỗi', () => {
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5));
  assert.notEqual(convert(usd(5), 'USD', null), usd(5));
  assert.throws(() => convert(usd(5), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(5), 'EUR', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', 'x'), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'USD', { VND: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', { USD: { EUR: 0.9 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', { USD: { EUR: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', { USD: { EUR: '0.00' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', { USD: { EUR: '-1' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'EUR', { USD: { EUR: '1e2' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: làm tròn từng khoản', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(
    convertSum([usd(100), { minor: 100, currency: 'EUR' }], 'VND', rates),
    { minor: 25000 + 27000, currency: 'VND' },
  );
  assert.deepEqual(convertSum([usd(7)], 'USD', null), usd(7));
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
