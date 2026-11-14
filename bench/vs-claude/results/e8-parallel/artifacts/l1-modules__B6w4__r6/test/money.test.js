import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước, -0 thành 0, lỗi amount', () => {
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('5', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
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
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('  5 USD '), usd(500));
  assert.deepEqual(parseMoney('5', { currency: 'EUR' }), { minor: 500, currency: 'EUR' });
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  for (const bad of ['$-5', '5-', '(-5)', '(+$5)', '$5 $', 'USD 5 USD', '£5', '.5', ',5', '5.', '1e3', '1,23,456', '1234,567', '$', '', '1 000'])
    assert.throws(() => parseMoney(bad, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), bad);
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5 £ GBP'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: thứ tự lỗi và kiểu đầu vào', () => {
  assert.throws(() => parseMoney(5, { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1 000', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1.000.000 GBP', { locale: 'vi-VN' }), code('MONEY_INVALID_CURRENCY'));
  assert.deepEqual(parseMoney('1,000', { locale: 'en-US', currency: 'VND' }), { minor: 1000, currency: 'VND' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.throws(() => parseMoney('90071992547409.92 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.equal(parseMoney('90071992547409.91 USD').minor, 9007199254740991);
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 500, currency: 'EUR' }, { locale: 'fr-FR' }), '5,00 €');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(5), { negative: 'parens' }), '$0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'x' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'x' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'x', display: 'y' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'y' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'y' }), code('MONEY_INVALID_OPTION'));
});

test('formatMoney/parseMoney round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR'])
    for (const display of ['symbol', 'code'])
      for (const m of [usd(0), usd(-5), usd(123456789), { minor: -1234567, currency: 'VND' }, { minor: 9007199254740991, currency: 'EUR' }, { minor: 999, currency: 'VND' }])
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
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
  assert.throws(() => add(null, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 3), 3002399751580330);
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
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1'])
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply({ minor: 1, currency: 'XXX' }, '1'), code('MONEY_INVALID_CURRENCY'));
});

test('allocate: ví dụ đặc tả', () => {
  const mi = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mi(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mi(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mi(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mi(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mi(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mi(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mi(usd(0), [1, 3]), [0, 0]);
  assert.ok(allocate(usd(-1), [0, 1, 0]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate(usd(-1), [1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.equal(allocate({ minor: 3, currency: 'VND' }, [1, 1])[0].currency, 'VND');
  const big = mi(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0] + big[1], Number.MAX_SAFE_INTEGER);
});

test('allocate: lỗi tỉ lệ', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], 'x', null])
    assert.throws(() => allocate(usd(10), bad), code('MONEY_INVALID_RATIO'));
  assert.throws(() => allocate(null, [1]), code('MONEY_INVALID_AMOUNT'));
});

test('convert: ví dụ đặc tả', () => {
  const cv = (m, to) => convert(m, to, rates);
  assert.deepEqual(cv(usd(100), 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(cv(usd(300), 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(cv(usd(1), 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(cv(usd(1000), 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(cv(usd(5), 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(cv({ minor: 1000000, currency: 'VND' }, 'USD'), usd(4000));
  assert.deepEqual(cv({ minor: 1, currency: 'VND' }, 'USD'), usd(0));
  assert.ok(Object.is(cv({ minor: -1, currency: 'VND' }, 'USD').minor, 0));
  assert.deepEqual(cv(usd(-300), 'VND'), { minor: -75002, currency: 'VND' });
});

test('convert: cùng loại tiền, cặp trực tiếp, lỗi', () => {
  const m = usd(5);
  const same = convert(m, 'USD', null);
  assert.deepEqual(same, m);
  assert.notEqual(same, m);
  assert.throws(() => convert(m, 'XXX', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(m, 'VND', { EUR: { VND: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(m, 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { VND: 25000 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { VND: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { VND: '0.00' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { VND: '-1' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { VND: '1e3' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convertSum([usd(100), { minor: 500, currency: 'VND' }], 'VND', rates), { minor: 25500, currency: 'VND' });
  assert.deepEqual(convertSum([usd(1)], 'USD', {}), usd(1));
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'XXX', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convertSum([usd(1)], 'VND', {}), code('MONEY_MISSING_RATE'));
});
