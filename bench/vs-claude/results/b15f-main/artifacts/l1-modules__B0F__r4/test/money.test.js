import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
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

// ---- helpers
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof Error && e.code === code, code);
const usd = (minor) => ({ minor, currency: 'USD' });
const mins = (arr) => arr.map((p) => p.minor);

test('money: thứ tự kiểm và -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('-$5'), usd(-500));
  assert.deepEqual(parseMoney('+5 usd'), usd(500));
  assert.deepEqual(parseMoney('  EUR 5,00', { locale: 'vi-VN' }), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), usd(123456710));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.ok(Object.is(parseMoney('-0.001', { currency: 'USD' }).minor, 0));
  assert.ok(Object.is(parseMoney('-0', { currency: 'VND' }).minor, 0));
});

test('parseMoney: lỗi và thứ tự', () => {
  throwsCode(() => parseMoney('5', { locale: 'de-DE', currency: 'XXX' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '£5', '', '$', '1,23,456', '1,2345', '$5 $', '$5 USD',
    '(-5)', '(+5)', '(5', '1 234.5']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5,5', { locale: 'vi-VN', currency: 'USD' }) && parseMoney('5.5.5', { locale: 'en-US', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('GBP 5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('GBP .5'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('90071992547409.92', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(parseMoney('9007199254740991', { currency: 'VND' }).minor, 9007199254740991);
});

test('formatMoney: locale, display, negative', () => {
  const v = usd(123456);
  assert.equal(formatMoney(v, { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(v, { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(5), {}), '$0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
});

test('formatMoney: lỗi theo thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(usd(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(usd(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('formatMoney/parseMoney round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const currency of ['VND', 'USD', 'EUR']) {
      for (const minor of [0, 5, -5, 99, 100, 123456, -1234567, 9007199254740991, -9007199254740991]) {
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
  assert.deepEqual(subtract(usd(1), usd(3)), usd(-2));
  assert.ok(Object.is(subtract(usd(3), usd(3)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  throwsCode(() => add(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(usd(9007199254740991), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(usd(-9007199254740991), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(usd(1.5), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(usd(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => compare(5, usd(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven: ví dụ SPEC', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [-7, 2, -4], [6, 3, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740990, 2), 4503599627370495);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, 2.5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven('1', 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply: ví dụ SPEC', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(100), '-1.5'), usd(-150));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    throwsCode(() => multiply(usd(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(usd(9007199254740991), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(null, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ SPEC', () => {
  assert.deepEqual(mins(allocate(usd(10), [1, 3])), [2, 8]);
  assert.deepEqual(mins(allocate(usd(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(mins(allocate(usd(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(mins(allocate(usd(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(mins(allocate(usd(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(mins(allocate(usd(-10), [1, 3])), [-2, -8]);
  const z = allocate(usd(-1), [0, 1]);
  assert.ok(Object.is(z[0].minor, 0));
  assert.deepEqual(z[1], usd(-1));
  assert.ok(allocate({ minor: 3, currency: 'VND' }, [1, 1]).every((p) => p.currency === 'VND'));
  assert.deepEqual(mins(allocate(usd(0), [1, 2])), [0, 0]);
  assert.deepEqual(mins(allocate(usd(9007199254740991), [9007199254740991, 9007199254740991])), [4503599627370496, 4503599627370495]);
});

test('allocate: lỗi ratios', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], null, 'x', [1, NaN]]) {
    throwsCode(() => allocate(usd(10), bad), 'MONEY_INVALID_RATIO');
  }
});

const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };

test('convert: bảng ví dụ SPEC', () => {
  const eq = (m, to, e) => assert.deepEqual(convert(m, to, rates), { minor: e, currency: to });
  eq(usd(100), 'VND', 25000);
  eq(usd(300), 'VND', 75002);
  eq(usd(1), 'VND', 250);
  eq(usd(1000), 'EUR', 920);
  eq(usd(5), 'EUR', 5);
  eq({ minor: 1000000, currency: 'VND' }, 'USD', 4000);
  eq({ minor: 1, currency: 'VND' }, 'USD', 0);
  eq(usd(-300), 'VND', -75002);
  assert.ok(Object.is(convert({ minor: 1, currency: 'VND' }, 'USD', rates).minor, 0));
  assert.ok(Object.is(convert({ minor: -1, currency: 'VND' }, 'USD', rates).minor, 0));
});

test('convert: cùng loại tiền, thiếu và sai tỉ giá', () => {
  const same = usd(7);
  const out = convert(same, 'USD', null);
  assert.deepEqual(out, same);
  assert.notEqual(out, same);
  throwsCode(() => convert(usd(1), 'XXX', rates), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(usd(1), 'VND', { EUR: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'EUR' }, 'VND', { VND: { EUR: '0.1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '']) {
    throwsCode(() => convert(usd(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(usd(9007199254740991), 'VND', rates), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(usd(300), 'VND', rates), { minor: 75002, currency: 'VND' });
  assert.deepEqual(
    convertSum([usd(100), { minor: 1000, currency: 'EUR' }, { minor: 7, currency: 'VND' }], 'VND', rates),
    { minor: 25000 + 270000 + 7, currency: 'VND' },
  );
  throwsCode(() => convertSum([], 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([usd(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});

test('mỗi mã MONEY_* đã có test', () => {
  throwsCode(() => money(1, 'X'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.1, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(usd(1), { minor: 1, currency: 'VND' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => formatMoney(usd(1), { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(usd(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => allocate(usd(1), []), 'MONEY_INVALID_RATIO');
  throwsCode(() => multiply(usd(1), 1), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
});
