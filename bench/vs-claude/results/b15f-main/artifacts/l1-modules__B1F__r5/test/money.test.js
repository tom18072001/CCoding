import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
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

test('money: hợp lệ, -0 thành +0, kiểm currency trước amount', () => {
  assert.deepEqual(money(5, 'USD'), usd(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('5', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: các ví dụ trong SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('  usd 5.5 '), usd(550));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), usd(123456710));
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
});

test('parseMoney: lỗi cú pháp', () => {
  for (const bad of ['$-5', '5-', '.5 USD', '5. USD', '1e3 USD', '$5 USD', '£5', '1,23,456 USD',
    '1,2345 USD', '1234,567.00 USD', '(-$5)', '', '$', '5 $ $', '1 234.00 USD']) {
    assert.throws(() => parseMoney(bad), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('90071992547409.92 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1 234,5', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: mã lỗi currency/locale và thứ tự kiểm', () => {
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5', { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 EUR', { currency: 'USD' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5 USD', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('£5 GBP'), code('MONEY_INVALID_AMOUNT'));
});

test('formatMoney: locale, display, negative', () => {
  const m = usd(-123456);
  assert.equal(formatMoney(m), '-$1,234.56');
  assert.equal(formatMoney(m, { negative: 'parens' }), '($1,234.56)');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 0, currency: 'VND' }), '₫0');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'de' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { locale: 'de', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('format rồi parse khứ hồi', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 5, -5, 99, 100, 123456, -1234567, 1000000000, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
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
  assert.deepEqual(subtract(usd(1), usd(3)), usd(-2));
  assert.ok(Object.is(subtract(usd(3), usd(3)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  const a = usd(1);
  assert.notEqual(add(a, usd(0)), a);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(5, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, usd(1)), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, 2 ** 53), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven('1', 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply: làm tròn một lần và lỗi', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(250), '-0.01').minor, -2);
  assert.ok(Object.is(multiply(usd(5), '0').minor, 0));
  assert.ok(Object.is(multiply(usd(1), '-0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(null, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ SPEC và biên', () => {
  const ms = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(ms(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(ms(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(ms(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(ms(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(ms(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(ms(usd(0), [1, 1]), [0, 0]);
  assert.ok(allocate(usd(-1), [0, 1, 0]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate(usd(-1), [0, 1, 0]).every((p) => p.currency === 'USD'));
  const big = ms(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0] + big[1], Number.MAX_SAFE_INTEGER);
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], undefined]) {
    assert.throws(() => allocate(usd(5), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert: ví dụ SPEC', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, RATES).minor;
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.ok(Object.is(c(-1, 'VND', 'USD'), 0));
});

test('convert: cùng loại tiền, thiếu cặp, tỉ giá sai', () => {
  assert.deepEqual(convert(usd(5), 'USD', 'không đọc'), usd(5));
  assert.throws(() => convert(usd(5), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(5), 'EUR', { EUR: { USD: '1.1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '']) {
    assert.throws(() => convert(usd(5), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  const three = [usd(100), usd(100), usd(100)];
  assert.deepEqual(convertSum(three, 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(usd(300), 'VND', RATES).minor, 75002);
  const mixed = [usd(100), { minor: 1000, currency: 'EUR' }];
  assert.deepEqual(convertSum(mixed, 'VND', RATES), { minor: 25000 + 270000, currency: 'VND' });
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum(three, 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
});
