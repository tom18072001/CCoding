import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const U = (minor) => ({ minor, currency: 'USD' });

test('money: kiểm lỗi và -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'VND').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ spec', () => {
  assert.deepEqual(parseMoney('$1,234.56'), U(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+usd 5'), U(500));
  assert.deepEqual(parseMoney('5 usd'), U(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'EUR' }), { minor: 123456710, currency: 'EUR' });
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney: lỗi cú pháp và thứ tự', () => {
  const bad = ['$-5', '5-', '.5', '5.', '1e3', '$5 $', '$5€', '£5', '', '$', '(-5)', '(+$5)', '1,23,456', '1234,567', '--5', '($5', '5)'];
  for (const t of bad) assert.throws(() => parseMoney(t, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), t);
  assert.throws(() => parseMoney('1 234', { locale: 'en-US', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('abc GBP'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('90071992547409.92 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.equal(parseMoney('90071992547409.91 USD').minor, 9007199254740991);
});

test('formatMoney', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(5)), '$0.05');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(U(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(123456), { display: 'none', locale: 'fr-FR' }), '1 234,56');
  assert.equal(formatMoney({ minor: 0, currency: 'EUR' }, { negative: 'parens' }), '€0.00');
  assert.equal(formatMoney({ minor: 100, currency: 'EUR' }, { locale: 'fr-FR' }), '1,00 €');
  assert.throws(() => formatMoney(U(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { locale: 'x', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'Q' }), code('MONEY_INVALID_CURRENCY'));
});

test('format rồi parse khứ hồi', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, -1, 99, 100, -12345, 123456789, -9007199254740991, 9007199254740991]) {
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
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(1)), U(0));
  assert.ok(Object.is(subtract(U(1), U(1)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  assert.throws(() => add(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(U(1), null), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4], [-7, 2, -4]];
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
  assert.equal(multiply(U(-350), '0.01').minor, -4);
  assert.equal(multiply(U(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(U(100), '-0').minor, 0));
  for (const f of [2, '1e2', '.5', '5.', '', ' 1', '+1', null]) {
    assert.throws(() => multiply(U(1), f), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(U(9007199254740991), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const m = (xs, r, cur = 'USD') => allocate({ minor: xs, currency: cur }, r).map((p) => p.minor);
  assert.deepEqual(m(10, [1, 3]), [2, 8]);
  assert.deepEqual(m(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(m(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(m(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(m(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(m(-10, [1, 3]), [-2, -8]);
  assert.ok(allocate(U(-1), [0, 1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(Object.is(allocate(U(-1), [1, 0])[1].minor, 0));
  assert.equal(allocate({ minor: 5, currency: 'VND' }, [1])[0].currency, 'VND');
  const big = m(9007199254740991, [9007199254740991, 9007199254740991]);
  assert.equal(big[0] + big[1], 9007199254740991);
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2'], null]) {
    assert.throws(() => allocate(U(5), r), code('MONEY_INVALID_RATIO'));
  }
});

const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};
test('convert', () => {
  const c = (m, to) => convert(m, to, RATES);
  assert.deepEqual(c(U(100), 'VND'), { minor: 25000, currency: 'VND' });
  assert.equal(c(U(300), 'VND').minor, 75002);
  assert.equal(c(U(1), 'VND').minor, 250);
  assert.equal(c(U(1000), 'EUR').minor, 920);
  assert.equal(c(U(5), 'EUR').minor, 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD').minor, 4000);
  assert.ok(Object.is(c({ minor: 1, currency: 'VND' }, 'USD').minor, 0));
  assert.equal(c(U(-300), 'VND').minor, -75002);
  // cùng loại tiền: không đọc rates, trả bản sao
  assert.deepEqual(convert(U(5), 'USD', null), U(5));
  const same = U(5);
  assert.notEqual(convert(same, 'USD', undefined), same);
  assert.throws(() => convert(U(5), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert({ minor: 5, currency: 'EUR' }, 'USD', { USD: { EUR: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const r of [25000, '0', '0.0', '-1', '1e3', '.5', '5.', ' 5']) {
    assert.throws(() => convert(U(5), 'VND', { USD: { VND: r } }), code('MONEY_INVALID_RATE'), String(r));
  }
});

test('convertSum đổi từng khoản rồi cộng', () => {
  assert.equal(convertSum([U(100), U(100), U(100)], 'VND', RATES).minor, 75000);
  assert.equal(
    convertSum([U(100), { minor: 27000, currency: 'EUR' }, { minor: 5, currency: 'VND' }], 'VND', RATES).minor,
    25000 + 27000 * 270 + 5,
  );
  assert.deepEqual(convertSum([U(1)], 'USD', {}), U(1));
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
});
