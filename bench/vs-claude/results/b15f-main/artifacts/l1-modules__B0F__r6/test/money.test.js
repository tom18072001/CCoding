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

const U = (minor) => ({ minor, currency: 'USD' });
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: tạo, kiểm thứ tự, không -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.equal(code(() => money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => money(1, 5)), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney: các ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('5 usd'), { minor: 500, currency: 'USD' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('$1.005').minor, 100);
  assert.equal(parseMoney('$1.015').minor, 102);
  assert.equal(parseMoney('$1.0051').minor, 101);
  assert.equal(parseMoney('2.5 ₫').minor, 2);
  assert.equal(parseMoney('3.5 ₫').minor, 4);
  assert.equal(parseMoney('-$1.005').minor, -100);
});

test('parseMoney: lỗi theo mã và thứ tự', () => {
  assert.equal(code(() => parseMoney('$5', { locale: 'de-DE' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { locale: 'xx', currency: 'USD' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { currency: 'GBP' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney(5, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '$5$', '£5', '1,23,456', '(-5 $)', '']) {
    assert.equal(code(() => parseMoney(bad, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(code(() => parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('€5', { currency: 'USD' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => parseMoney('$90071992547409.92')), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative, round-trip', () => {
  assert.equal(formatMoney(U(500), { locale: 'vi-VN' }), '5,00 $');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const m of [U(-123456789), U(0), { minor: -1234567, currency: 'VND' }, { minor: 7, currency: 'EUR' }]) {
      for (const display of ['symbol', 'code']) {
        assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
  assert.equal(code(() => formatMoney(U(1), { locale: 'xx' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => formatMoney(U(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(U(1), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(null)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => formatMoney({ minor: 1, currency: 'X' }, { locale: 'xx' })), 'MONEY_INVALID_CURRENCY');
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(U(5), U(7)), U(12));
  assert.deepEqual(subtract(U(5), U(7)), U(-2));
  assert.ok(Object.is(subtract(U(5), U(5)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  assert.equal(code(() => add(U(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => compare(U(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => add(U(Number.MAX_SAFE_INTEGER), U(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => add(U(1.5), U(1))), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven: ví dụ SPEC và biên', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740990, 3), 3002399751580330);
  assert.equal(code(() => divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => divideRoundHalfEven(1.5, 2)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => divideRoundHalfEven(1, '2')), 'MONEY_INVALID_AMOUNT');
});

test('multiply: ví dụ SPEC và lỗi', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(250), '-0.01').minor, -2);
  assert.ok(Object.is(multiply(U(1), '-0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.equal(code(() => multiply(U(1), bad)), 'MONEY_INVALID_RATE');
  }
  assert.equal(code(() => multiply(U(Number.MAX_SAFE_INTEGER), '2')), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ SPEC và lỗi', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.ok(allocate(U(-1), [0, 1, 0]).every((p) => p.currency === 'USD'));
  assert.ok(Object.is(allocate(U(-1), [0, 1])[0].minor, 0));
  assert.equal(code(() => allocate(U(1), [])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => allocate(U(1), [0, 0])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => allocate(U(1), [1, -1])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => allocate(U(1), [1.5])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => allocate(U(1), 'x')), 'MONEY_INVALID_RATIO');
});

test('convert: ví dụ SPEC và lỗi', () => {
  const c = (m, to) => convert(m, to, RATES).minor;
  assert.equal(c(U(100), 'VND'), 25000);
  assert.equal(c(U(300), 'VND'), 75002);
  assert.equal(c(U(1), 'VND'), 250);
  assert.equal(c(U(1000), 'EUR'), 920);
  assert.equal(c(U(5), 'EUR'), 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD'), 4000);
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD'), 0);
  assert.equal(c(U(-300), 'VND'), -75002);
  // cùng loại tiền: bản sao, không đọc rates
  assert.deepEqual(convert(U(5), 'USD', null), U(5));
  assert.equal(code(() => convert(U(1), 'XXX', RATES)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert({ minor: 1, currency: 'VND' }, 'USD', { VND: {} })), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert(U(1), 'VND', {})), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert(U(1), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: 25000 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: '-1' } })), 'MONEY_INVALID_RATE');
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.deepEqual(
    convertSum([U(1000), { minor: 5000, currency: 'VND' }], 'EUR', { USD: { EUR: '0.92' }, VND: { EUR: '0.00003' } }),
    { minor: 920 + 15, currency: 'EUR' },
  );
  assert.equal(code(() => convertSum([], 'VND', RATES)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => convertSum('x', 'VND', RATES)), 'MONEY_INVALID_AMOUNT');
});
