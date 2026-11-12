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

// ---- Mở rộng ----

const code = (c) => (e) => e && e.code === c;
const U = (minor) => ({ minor, currency: 'USD' });
const V = (minor) => ({ minor, currency: 'VND' });
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: hợp lệ, -0, thứ tự lỗi currency trước amount', () => {
  assert.deepEqual(money(5, 'USD'), U(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), V(1234567));
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+usd 5'), U(500));
  assert.deepEqual(parseMoney(' 5 EUR '), { minor: 500, currency: 'EUR' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('$1.005').minor, 100);
  assert.equal(parseMoney('$1.015').minor, 102);
  assert.equal(parseMoney('$1.0051').minor, 101);
  assert.equal(parseMoney('2.5 ₫').minor, 2);
  assert.equal(parseMoney('3.5 ₫').minor, 4);
  assert.equal(parseMoney('-$1.005').minor, -100);
  assert.equal(parseMoney('-$1.015').minor, -102);
  assert.ok(Object.is(parseMoney('-0.4 ₫').minor, 0));
});

test('parseMoney: lỗi cú pháp', () => {
  for (const bad of ['$-5', '5-', '.5', '5.', '$.5', '1e3', '£5', '', '$', '(-5)', '(+5)', '$5 $', '$5€', '1,23,456', '1234,567', '12 345', '1,2345']) {
    assert.throws(() => parseMoney(bad), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney('5,5', { locale: 'en-US' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992 ₫'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('9007199254740991 ₫'), V(9007199254740991));
});

test('parseMoney: lỗi loại tiền, mismatch, locale, thứ tự', () => {
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('1,5', { locale: 'fr-FR' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney('$5', { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { locale: 'x', currency: 'XXX' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('x5 GBP'), code('MONEY_INVALID_AMOUNT'));
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(V(1234567)), '₫1,234,567');
  assert.equal(formatMoney(U(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney(U(5)), '$0.05');
  assert.equal(formatMoney({ minor: 0, currency: 'EUR' }, { locale: 'fr-FR' }), '0,00 €');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'x' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'x' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(U(1), { locale: 'x', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(U(1), { display: 'bad', negative: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('format rồi parse khứ hồi', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of [U(0), U(-1), U(123456789), V(-1234567), { minor: 99, currency: 'EUR' }]) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.ok(Object.is(subtract(U(1), U(1)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(1)), 1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.throws(() => add(U(1), V(1)), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), V(1)), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(null, U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => add(V(1), { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [-1, 3, 0], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, r] of cases) {
    const got = divideRoundHalfEven(n, d);
    assert.ok(Object.is(got, r), `${n}/${d} → ${got}`);
  }
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 1), 9007199254740991);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1.5, 0), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(-350), '0.01').minor, -4);
  assert.equal(multiply(U(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(U(1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(U(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => multiply(U(9007199254740991), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply({ minor: 1, currency: 'X' }, 'x'), code('MONEY_INVALID_CURRENCY'));
});

test('allocate: ví dụ SPEC và ca biên', () => {
  const a = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(a(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(a(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(a(U(0), [1, 1]), [0, 0]);
  assert.ok(Object.is(allocate(U(-1), [0, 1])[0].minor, 0));
  assert.equal(allocate(V(9007199254740991), [1, 1, 1]).reduce((s, p) => s + p.minor, 0), 9007199254740991);
  assert.equal(allocate(V(7), [1, 1])[0].currency, 'VND');
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', null, [1, '2']]) {
    assert.throws(() => allocate(U(1), bad), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(null, []), code('MONEY_INVALID_AMOUNT'));
});

test('convert: ví dụ SPEC', () => {
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.equal(convert(U(1), 'VND', RATES).minor, 250);
  assert.deepEqual(convert(U(1000), 'EUR', RATES), { minor: 920, currency: 'EUR' });
  assert.equal(convert(U(5), 'EUR', RATES).minor, 5);
  assert.equal(convert(V(1000000), 'USD', RATES).minor, 4000);
  assert.equal(convert(V(1), 'USD', RATES).minor, 0);
  assert.equal(convert(U(-300), 'VND', RATES).minor, -75002);
  assert.deepEqual(convert(U(100), 'USD', 'không đọc'), U(100));
  const same = U(1);
  assert.notEqual(convert(same, 'USD'), same);
});

test('convert: lỗi', () => {
  assert.throws(() => convert(U(1), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(U(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(1), 'VND', 5), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(V(1), 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(V(1), 'EUR', { VND: { USD: '1' } }), code('MONEY_MISSING_RATE'));
  for (const bad of [1, '0', '0.0', '-1', '1e3', '.5', '']) {
    assert.throws(() => convert(U(1), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => convert(U(9007199254740991), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), V(75000));
  assert.deepEqual(convertSum([U(100), V(5)], 'VND', RATES), V(25005));
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([U(1)], 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convertSum([V(1)], 'EUR', RATES), code('MONEY_MISSING_RATE'));
});
