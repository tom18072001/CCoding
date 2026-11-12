import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven, multiply, allocate, convert, convertSum,
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

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });
const R = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };

test('money: kiểm currency trước minor, -0 thành +0', () => {
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
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
  assert.deepEqual(parseMoney('1234567.1 $'), usd(123456710));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  const p = (s, currency) => parseMoney(s, { currency }).minor;
  assert.equal(p('1.005', 'USD'), 100);
  assert.equal(p('1.015', 'USD'), 102);
  assert.equal(p('1.0051', 'USD'), 101);
  assert.equal(p('2.5', 'VND'), 2);
  assert.equal(p('3.5', 'VND'), 4);
  assert.equal(p('-2.5', 'VND'), -2);
  assert.equal(p('-3.5', 'VND'), -4);
  assert.ok(Object.is(p('-0.001', 'USD'), 0));
});

test('parseMoney: lỗi cú pháp và thứ tự kiểm', () => {
  for (const bad of ['$-5', '5-', '.5 $', '5. $', '1e3 $', '£5', '$5$', '$ 5 €', '(-$5)', '(+$5)', '1,23,456 $', '1234,567 $', '', 'abc', '1 234 $']) {
    assert.throws(() => parseMoney(bad), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('90071992547409.92 $'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP 5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5', { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('€5', { currency: 'USD' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney(5, { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { locale: 'en-US', currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
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
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('format/parse round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const currency of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 123456789, -9007199254740991]) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  const eur = { minor: 1, currency: 'EUR' };
  assert.throws(() => add(usd(1), eur), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), eur), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), eur), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(usd(1), 5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(usd(1), { minor: 1, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.notEqual(add(usd(1), usd(2)), add(usd(1), usd(2)));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER - 1, 2), 4503599627370495);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  assert.equal(multiply(usd(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply('x', '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ spec và lỗi', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(usd(0), [1, 1]), [0, 0]);
  assert.ok(allocate(usd(-1), [0, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate({ minor: 5, currency: 'VND' }, [1, 1]).every((p) => p.currency === 'VND'));
  assert.equal(mins(usd(Number.MAX_SAFE_INTEGER), [3, 5, 7]).reduce((a, b) => a + b, 0), Number.MAX_SAFE_INTEGER);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2'], undefined]) {
    assert.throws(() => allocate(usd(10), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  const c = (m, to) => convert(m, to, R);
  assert.deepEqual(c(usd(100), 'VND'), { minor: 25000, currency: 'VND' });
  assert.equal(c(usd(300), 'VND').minor, 75002);
  assert.equal(c(usd(1), 'VND').minor, 250);
  assert.equal(c(usd(1000), 'EUR').minor, 920);
  assert.equal(c(usd(5), 'EUR').minor, 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD').minor, 4000);
  assert.ok(Object.is(c({ minor: 1, currency: 'VND' }, 'USD').minor, 0));
  assert.equal(c(usd(-300), 'VND').minor, -75002);
  assert.throws(() => c({ minor: 1, currency: 'VND' }, 'EUR'), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'EUR' }, 'USD', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => c(usd(1), 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(1), 'VND', null), code('MONEY_INVALID_RATE'));
  for (const bad of [25000, '0', '-1', '1e3', '0.0']) {
    assert.throws(() => convert(usd(1), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convert: cùng loại tiền trả bản sao, không đọc rates', () => {
  const m = usd(7);
  const r = convert(m, 'USD', undefined);
  assert.deepEqual(r, m);
  assert.notEqual(r, m);
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', R), { minor: 75000, currency: 'VND' });
  assert.equal(convertSum([usd(100), { minor: 1000, currency: 'EUR' }], 'VND', R).minor, 25000 + 270000);
  assert.deepEqual(convertSum([usd(5)], 'USD', R), usd(5));
  assert.throws(() => convertSum([], 'VND', R), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', R), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'VND', {}), code('MONEY_MISSING_RATE'));
});
