import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `mong đợi ${code}`);

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

test('money: hợp lệ, -0 thành +0, thứ tự kiểm lỗi', () => {
  assert.deepEqual(money(5, 'VND'), { minor: 5, currency: 'VND' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney: ví dụ trong SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
});

test('parseMoney: dấu, token, vị trí, cú pháp', () => {
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('+$5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('usd 5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('  5 eur '), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('1234567.1 $'), { minor: 123456710, currency: 'USD' });
  assert.deepEqual(parseMoney('5', { currency: 'VND' }), { minor: 5, currency: 'VND' });
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  const bads = ['$-5', '5-', '(-5) $', '(+5 $)', '$5$', '$5 USD', '£5', '.5 $', ',5 $', '5. $', '1e3 $',
    '1,23 $', '1,2345 $', '12,34,567 $', '1 234 $', '', '$', '1,234.5.6 $'];
  for (const bad of bads) throwsCode(() => parseMoney(bad), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1 234 $', { locale: 'vi-VN' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1,234.5 $', { locale: 'vi-VN' }), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: thứ tự lỗi và mã lỗi', () => {
  throwsCode(() => parseMoney('5', { currency: 'GBP', locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('£5 GBP'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  assert.deepEqual(parseMoney('$5', { currency: 'USD' }), U(500));
  throwsCode(() => parseMoney('90071992547409.92 $'), 'MONEY_INVALID_AMOUNT');
  assert.deepEqual(parseMoney('90071992547409.91 $'), U(9007199254740991));
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 $').minor, 100);
  assert.equal(parseMoney('1.015 $').minor, 102);
  assert.equal(parseMoney('1.0051 $').minor, 101);
  assert.equal(parseMoney('-1.015 $').minor, -102);
  assert.equal(parseMoney('2.5 ₫').minor, 2);
  assert.equal(parseMoney('3.5 ₫').minor, 4);
  assert.equal(parseMoney('-2.5 ₫').minor, -2);
  assert.equal(parseMoney('2.50001 ₫').minor, 3);
  assert.ok(Object.is(parseMoney('-0.4 ₫').minor, 0));
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 500, currency: 'EUR' }, { locale: 'fr-FR' }), '5,00 €');
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
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('format rồi parse là phép nghịch', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const currency of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 123456, -9007199254740991, 9007199254740991]) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(U(100), U(250)), U(350));
  assert.deepEqual(subtract(U(100), U(250)), U(-150));
  assert.ok(Object.is(subtract(U(5), U(5)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const eur = { minor: 1, currency: 'EUR' };
  throwsCode(() => add(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(9007199254740991), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-9007199254740991), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add('x', U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(1), { minor: 1, currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add({ minor: 1.5, currency: 'EUR' }, { minor: 1, currency: 'GBP' }), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1],
    [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, 0.5), 'MONEY_INVALID_AMOUNT');
});

test('multiply: ví dụ SPEC và lỗi', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(250), '-0.01').minor, -2);
  assert.ok(Object.is(multiply(U(1), '-0.1').minor, 0));
  assert.equal(multiply(U(3), '2').minor, 6);
  for (const bad of [1.5, '1e2', '.5', '5.', '+1', ' 1', '', null]) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(9007199254740991), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply({ minor: 1, currency: 'GBP' }, '2'), 'MONEY_INVALID_CURRENCY');
});

test('allocate: ví dụ SPEC', () => {
  const a = (minor, r) => allocate(U(minor), r).map((p) => p.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(Object.is(a(-1, [0, 1, 1])[0], 0));
  assert.ok(allocate({ minor: -1, currency: 'VND' }, [1, 1]).every((p) => p.currency === 'VND'));
  assert.deepEqual(a(9007199254740991, [1, 1]), [4503599627370496, 4503599627370495]);
  assert.equal(a(12345, [7, 3, 11, 2]).reduce((x, y) => x + y, 0), 12345);
});

test('allocate: ratios không hợp lệ', () => {
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], null, undefined]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
  throwsCode(() => allocate(null, [1]), 'MONEY_INVALID_AMOUNT');
});

const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('convert: ví dụ SPEC', () => {
  const c = (minor, currency, to) => convert({ minor, currency }, to, RATES).minor;
  assert.equal(c(100, 'USD', 'VND'), 25000);
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.ok(Object.is(c(-1, 'VND', 'USD'), 0));
});

test('convert: cùng loại tiền, không nghịch đảo, lỗi', () => {
  const src = U(123);
  const same = convert(src, 'USD', null);
  assert.deepEqual(same, src);
  assert.notEqual(same, src);
  throwsCode(() => convert(U(1), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(U(1), 5, RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 1, currency: 'EUR' }, 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', { EUR: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '', null]) {
    throwsCode(() => convert(U(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(U(9007199254740991), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.deepEqual(
    convertSum([U(100), { minor: 1000000, currency: 'VND' }, { minor: 10, currency: 'EUR' }], 'USD', RATES),
    { minor: 100 + 4000 + 11, currency: 'USD' },
  );
  assert.deepEqual(convertSum([U(5)], 'USD', null), U(5));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
});

test('kết quả là đối tượng mới', () => {
  const a = U(1);
  assert.notEqual(add(a, U(0)), a);
  assert.notEqual(allocate(a, [1])[0], a);
  assert.notEqual(multiply(a, '1'), a);
});
