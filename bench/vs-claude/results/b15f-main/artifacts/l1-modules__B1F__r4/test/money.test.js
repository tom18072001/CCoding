import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `cần ${code}`);

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

test('money: kiểm currency trước amount, -0 thành +0', () => {
  assert.deepEqual(money(5, 'USD'), U(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ trong SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('  1234567.5 USD '), U(123456750));
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

test('parseMoney: lỗi cú pháp và thứ tự kiểm', () => {
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '1,23,4', '£5', '$5 $', '$5 USD', '(-5) $', '5 x', '', '1 234.56']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('1.234,56', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('(+5)', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney(5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5', { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('$5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'xx', currency: 'XXX' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('GBP .5'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
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
  assert.equal(formatMoney({ minor: 1500, currency: 'EUR' }, { locale: 'fr-FR' }), '15,00 €');
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1, currency: 'GBP' }, { locale: 'xx' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('parse(format(m)) round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const cur of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 123456789, -9007199254740991, 9007199254740991]) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add / subtract / compare', () => {
  assert.deepEqual(add(U(100), U(250)), U(350));
  assert.deepEqual(subtract(U(100), U(250)), U(-150));
  assert.ok(Object.is(subtract(U(5), U(5)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const e = { minor: 1, currency: 'EUR' };
  throwsCode(() => add(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(9007199254740991), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-9007199254740991), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(5, U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add({ minor: 'x', currency: 'USD' }, e), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [9007199254740991, 1, 9007199254740991]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496); // phần .5, 4503599627370495 lẻ -> chẵn
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(2 ** 53, 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.deepEqual(multiply(U(1005), '0.08'), U(80));
  assert.deepEqual(multiply(U(250), '0.01'), U(2));
  assert.deepEqual(multiply(U(350), '0.01'), U(4));
  assert.deepEqual(multiply(U(1005), '1.1'), U(1106));
  assert.deepEqual(multiply(U(-250), '0.01'), U(-2));
  assert.deepEqual(multiply(U(100), '-1.5'), U(-150));
  assert.ok(Object.is(multiply(U(100), '0').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', 'abc', null, '+1']) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(9007199254740991), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(null, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ SPEC', () => {
  const a = (minor, ratios, cur = 'USD') => allocate({ minor, currency: cur }, ratios).map((p) => p.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(allocate(U(-1), [0, 1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(allocate({ minor: 10, currency: 'VND' }, [1, 1]).map((p) => p.currency), ['VND', 'VND']);
  assert.deepEqual(a(0, [1, 2]), [0, 0]);
  for (let m = -50; m <= 50; m++) {
    const parts = a(m, [3, 0, 5, 5, 2]);
    assert.equal(parts.reduce((x, y) => x + y, 0), m);
  }
});

test('allocate: lỗi', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', null, [1, '2'], [2 ** 53]]) {
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
  const c = (minor, from, to) => convert({ minor, currency: from }, to, RATES);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(c(300, 'USD', 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(c(1, 'USD', 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(c(1000, 'USD', 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(c(5, 'USD', 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(c(1000000, 'VND', 'USD'), { minor: 4000, currency: 'USD' });
  assert.deepEqual(c(1, 'VND', 'USD'), { minor: 0, currency: 'USD' });
  assert.deepEqual(c(-300, 'USD', 'VND'), { minor: -75002, currency: 'VND' });
});

test('convert: cùng loại tiền không đọc rates, trả bản sao', () => {
  const m = U(123);
  const r = convert(m, 'USD', null);
  assert.deepEqual(r, m);
  assert.notEqual(r, m);
});

test('convert: lỗi', () => {
  throwsCode(() => convert(U(1), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(U(1), 'VND', { EUR: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'EUR' }, 'USD', { USD: { EUR: '0.92' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of ['0', '0.00', 25000, '-1', '1e3', '.5', '', null]) {
    throwsCode(() => convert(U(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
});

test('convertSum: làm tròn từng khoản', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(U(300), 'VND', RATES), { minor: 75002, currency: 'VND' });
  assert.deepEqual(
    convertSum([U(100), { minor: 1, currency: 'EUR' }, { minor: 7, currency: 'VND' }], 'VND', RATES),
    { minor: 25000 + 270 + 7, currency: 'VND' },
  );
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convertSum([U(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});
