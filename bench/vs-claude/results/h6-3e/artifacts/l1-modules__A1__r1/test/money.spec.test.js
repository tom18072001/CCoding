import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY')); // currency trước
});

test('parseMoney: ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('  5 EUR '), { minor: 500, currency: 'EUR' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.ok(Object.is(parseMoney('-0.4', { currency: 'VND' }).minor, 0));
  assert.equal(parseMoney('0.001', { currency: 'USD' }).minor, 0);
});

test('parseMoney: lỗi và thứ tự', () => {
  const bad = ['$-5', '5-', '.5', '5.', '1e3', '$5$', '£5', '', '$', '(-$5)', '1,23,456', '12,34', '1234,567', '$ 1 000'];
  for (const s of bad) assert.throws(() => parseMoney(s), code('MONEY_INVALID_AMOUNT'), s);
  assert.throws(() => parseMoney('GBP 5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('GBP 5x'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$90071992547409.92'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('$90071992547409.91'), usd(9007199254740991));
  assert.throws(() => parseMoney('1 234,56 €', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
});

test('formatMoney', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(5), { locale: 'vi-VN', display: 'code' }), '0,05 USD');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.throws(() => formatMoney(usd(1), { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
});

test('format/parse round trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, -1, 99, 100, 123456789, -9007199254740991, 9007199254740991]) {
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
  assert.deepEqual(subtract(usd(1), usd(1)), usd(0));
  assert.ok(Object.is(subtract(usd(1), usd(1)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(9007199254740991), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-9007199254740991), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(usd(1), 5), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 1), 9007199254740991);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(100), '-1.5'), usd(-150));
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const f of [1, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(usd(1), f), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(9007199254740991), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const amounts = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(amounts(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(amounts(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(amounts(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(amounts(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(amounts(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(amounts(usd(-10), [1, 3]), [-2, -8]);
  assert.ok(Object.is(amounts(usd(-1), [0, 1])[0], 0));
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1]), [{ minor: 3, currency: 'VND' }]);
  assert.equal(amounts(usd(9007199254740991), [1, 1]).reduce((a, b) => a + b), 9007199254740991);
  for (const r of [[], 'a', [0, 0], [-1, 2], [1.5], [NaN]]) {
    assert.throws(() => allocate(usd(1), r), code('MONEY_INVALID_RATIO'));
  }
});

const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('convert', () => {
  const v = (minor, c, to) => convert({ minor, currency: c }, to, rates).minor;
  assert.equal(v(100, 'USD', 'VND'), 25000);
  assert.equal(v(300, 'USD', 'VND'), 75002);
  assert.equal(v(1, 'USD', 'VND'), 250);
  assert.equal(v(1000, 'USD', 'EUR'), 920);
  assert.equal(v(5, 'USD', 'EUR'), 5);
  assert.equal(v(1000000, 'VND', 'USD'), 4000);
  assert.equal(v(1, 'VND', 'USD'), 0);
  assert.equal(v(-300, 'USD', 'VND'), -75002);
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5)); // không đọc rates
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'EUR' }, 'USD', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'VND', { USD: { VND: 25000 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'VND', { USD: { VND: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'VND', { USD: { VND: '-1' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
});

test('convertSum đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convertSum([usd(100), { minor: 1, currency: 'EUR' }], 'VND', rates), { minor: 25000 + 270, currency: 'VND' });
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
