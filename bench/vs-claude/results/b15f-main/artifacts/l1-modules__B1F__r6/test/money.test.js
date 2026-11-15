import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

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

const U = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: hợp lệ, -0, thứ tự lỗi', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'VND').minor, 0));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ spec và locale', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.ok(Object.is(parseMoney('-$0').minor, 0));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), U(123456710));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('-1.005 USD').minor, -100);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
});

test('parseMoney: lỗi và thứ tự', () => {
  const inv = code('MONEY_INVALID_AMOUNT');
  for (const t of ['$-5', '5-', '$5-', '(-$5)', '(+$5)', '.5 USD', ',5', '5. USD', '1e3 USD', '$5 $', '$5 €',
    '£5', '1,2,3 USD', '1234,567.00 USD', '$ 1 000', '', '$', '(5.00', '1.234,5 USD']) {
    assert.throws(() => parseMoney(t, { currency: 'USD' }), inv, t);
  }
  assert.throws(() => parseMoney(5), inv);
  assert.throws(() => parseMoney('5', { currency: 'USD', locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('abc GBP'), inv);
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('90071992547409.92 USD'), inv);
  assert.throws(() => parseMoney('9007199254740992 VND'), inv);
  assert.deepEqual(parseMoney('9007199254740991 VND'), { minor: 9007199254740991, currency: 'VND' });
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 500, currency: 'EUR' }, { locale: 'fr-FR' }), '5,00 €');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(U(1), { locale: 'de-DE', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(U(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('format/parse round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of [U(0), U(-1), U(123456789), { minor: -9007199254740991, currency: 'VND' }, { minor: 1000, currency: 'EUR' }]) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.ok(Object.is(subtract(U(1), U(1)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const E = { minor: 1, currency: 'EUR' };
  assert.throws(() => add(U(1), E), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(U(1), E), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), E), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(2 ** 53 - 1), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-(2 ** 53 - 1)), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(1, U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'X' }, 5), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(U(1), '0.1').minor, 0));
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(U(1), f), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(U(2 ** 53 - 1), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply('x', '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(0), [1, 3]), [0, 0]);
  assert.ok(Object.is(mins(U(-1), [0, 1])[0], 0));
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1, 1]), [{ minor: 2, currency: 'VND' }, { minor: 1, currency: 'VND' }]);
  assert.equal(mins(U(9007199254740991), [9007199254740991, 9007199254740991]).reduce((a, b) => a + b), 9007199254740991);
  for (const r of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], [1, NaN]]) {
    assert.throws(() => allocate(U(1), r), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, RATES).minor;
  assert.equal(c(100, 'USD', 'VND'), 25000);
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.deepEqual(convert(U(5), 'USD', null), U(5));
  assert.throws(() => convert(U(5), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'USD', { VND: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const r of [25000, '0', '0.0', '1e3', '-1', '.5', '']) {
    assert.throws(() => convert(U(5), 'VND', { USD: { VND: r } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => convert(U(2 ** 53 - 1), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: làm tròn từng khoản', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.deepEqual(
    convertSum([U(100), { minor: 1000, currency: 'VND' }], 'VND', RATES),
    { minor: 26000, currency: 'VND' },
  );
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
});
