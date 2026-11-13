import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });
const rates = {
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

test('money: thứ tự kiểm và -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ spec', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('5 EUR'), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), usd(123456710));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.ok(Object.is(parseMoney('-0.4', { currency: 'VND' }).minor, 0));
});

test('parseMoney: lỗi', () => {
  const bad = (t, o, c) => assert.throws(() => parseMoney(t, o), code(c), String(t));
  bad('5', { locale: 'de-DE' }, 'MONEY_INVALID_LOCALE');
  bad(5, { locale: 'de-DE' }, 'MONEY_INVALID_LOCALE');
  bad(5, { currency: 'GBP' }, 'MONEY_INVALID_CURRENCY');
  bad(5, { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5', undefined, 'MONEY_INVALID_CURRENCY');
  bad('$-5', undefined, 'MONEY_INVALID_AMOUNT');
  bad('5-', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('(-5)', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('$5$', undefined, 'MONEY_INVALID_AMOUNT');
  bad('$5 USD', undefined, 'MONEY_INVALID_AMOUNT');
  bad('£5', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5 GBP', undefined, 'MONEY_INVALID_CURRENCY');
  bad('5 GBP x', undefined, 'MONEY_INVALID_AMOUNT');
  bad('.5', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5.', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1e3', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,23,456', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,2345', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1 234', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,234,56', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('$5', { currency: 'EUR' }, 'MONEY_CURRENCY_MISMATCH');
  bad('90071992547409.92', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  const m = usd(-123456);
  assert.equal(formatMoney(m), '-$1,234.56');
  assert.equal(formatMoney(m, { negative: 'parens' }), '($1,234.56)');
  assert.equal(formatMoney(m, { display: 'code' }), '-USD 1,234.56');
  assert.equal(formatMoney(m, { display: 'none' }), '-1,234.56');
  assert.equal(formatMoney(m, { locale: 'vi-VN' }), '-1.234,56 $');
  assert.equal(formatMoney(m, { locale: 'fr-FR', negative: 'parens' }), '(1 234,56 $)');
  assert.equal(formatMoney(usd(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'x' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'x', display: 'y' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'y' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'y' }), code('MONEY_INVALID_OPTION'));
});

test('format/parse round trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const c of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 100, 123456789, -9007199254740991, 9007199254740991]) {
          for (const negative of ['sign', 'parens']) {
            const m = { minor, currency: c };
            assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative }), { locale }), m);
          }
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(3)), usd(-2));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(null, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, usd(1)), code('MONEY_INVALID_CURRENCY'));
  const a = usd(1);
  assert.notEqual(add(a, usd(0)), a);
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-1, 3, 0], [0, 5, 0]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1), 1);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, 2.5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven('1', 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(250), '-0.01').minor, -2);
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(null, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate', () => {
  const al = (minor, r, c = 'USD') => allocate({ minor, currency: c }, r).map((p) => p.minor);
  assert.deepEqual(al(10, [1, 3]), [2, 8]);
  assert.deepEqual(al(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(al(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(al(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(al(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(al(-10, [1, 3]), [-2, -8]);
  assert.deepEqual(al(0, [1, 3]), [0, 0]);
  assert.ok(al(-1, [0, 1]).every((x) => !Object.is(x, -0)));
  assert.equal(allocate({ minor: 5, currency: 'VND' }, [1])[0].currency, 'VND');
  assert.equal(al(Number.MAX_SAFE_INTEGER, [1, 1, 1]).reduce((x, y) => x + y), Number.MAX_SAFE_INTEGER);
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], null]) {
    assert.throws(() => allocate(usd(5), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, rates);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.equal(c(300, 'USD', 'VND').minor, 75002);
  assert.equal(c(1, 'USD', 'VND').minor, 250);
  assert.equal(c(1000, 'USD', 'EUR').minor, 920);
  assert.equal(c(5, 'USD', 'EUR').minor, 5);
  assert.equal(c(1000000, 'VND', 'USD').minor, 4000);
  assert.equal(c(1, 'VND', 'USD').minor, 0);
  assert.equal(c(-300, 'USD', 'VND').minor, -75002);
  // cùng loại: không đọc rates
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5));
  const src = usd(5);
  assert.notEqual(convert(src, 'USD', null), src);
  assert.throws(() => convert(usd(5), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { EUR: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: 25000 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '0.0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '-1' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', { USD: { VND: '1e3' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.equal(convertSum([usd(100), { minor: 1000, currency: 'EUR' }], 'VND', rates).minor, 25000 + 1000 * 270);
  assert.deepEqual(convertSum([usd(1), usd(2)], 'USD', null), usd(3));
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
