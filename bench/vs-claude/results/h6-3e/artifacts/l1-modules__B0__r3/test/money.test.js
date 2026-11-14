import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const U = (minor) => ({ minor, currency: 'USD' });
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('parse và format USD theo en-US', () => {
  assert.deepEqual(parseMoney('$1,234.56'), { minor: 123456, currency: 'USD' });
  assert.equal(formatMoney({ minor: 123456, currency: 'USD' }), '$1,234.56');
});

test('money: kiểm tra, -0, thứ tự lỗi', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.equal(code(() => money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => money(1, 5)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => money(2 ** 53, 'USD')), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('usd 5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('+5', { currency: 'EUR' }), { minor: 500, currency: 'EUR' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney: lỗi và thứ tự', () => {
  const bad = ['$-5', '5-', '$.5', '$5.', '1e3', '£5', '$5$', '$ 1,23,4', '1234,567', '(-5) $', '', '$', '$5 USD', '5 ab'];
  for (const t of bad) assert.equal(code(() => parseMoney(t)), 'MONEY_INVALID_AMOUNT', t);
  assert.equal(code(() => parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney('$5', { currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => parseMoney('$5', { locale: 'xx' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { locale: 'xx' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => parseMoney(5, { currency: 'ZZZ' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => parseMoney(5, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('1 234 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('90071992547409.92 USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => parseMoney('£5 GBP')), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(U(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(5)), '$0.05');
  assert.equal(code(() => formatMoney(U(1), { locale: 'de' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => formatMoney(U(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(U(1), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(null, { locale: 'de' })), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => formatMoney({ minor: 1.2, currency: 'ZZ' })), 'MONEY_INVALID_CURRENCY');
});

test('format/parse round-trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, -1, 99, 100, 123456789, -987654321, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
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

test('add/subtract/compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(2)), U(-1));
  assert.ok(Object.is(subtract(U(1), U(1)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  assert.equal(code(() => add(U(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => compare(U(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => add(U(Number.MAX_SAFE_INTEGER), U(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => add(null, U(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => add({ minor: 1, currency: 'XXX' }, U(1))), 'MONEY_INVALID_CURRENCY');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(code(() => divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => divideRoundHalfEven(1.5, 2)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => divideRoundHalfEven(1, '2')), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(U(1), '-0.1').minor, 0));
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.equal(code(() => multiply(U(1), f)), 'MONEY_INVALID_RATE');
  }
  assert.equal(code(() => multiply(U(Number.MAX_SAFE_INTEGER), '2')), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ đặc tả', () => {
  const al = (minor, r) => allocate(U(minor), r).map((p) => p.minor);
  assert.deepEqual(al(10, [1, 3]), [2, 8]);
  assert.deepEqual(al(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(al(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(al(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(al(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(al(-10, [1, 3]), [-2, -8]);
  assert.ok(allocate(U(-1), [0, 1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate(U(-1), [0, 1, 1]).every((p) => p.currency === 'USD'));
  const big = al(Number.MAX_SAFE_INTEGER, [1, 1, 1]);
  assert.equal(big.reduce((a, b) => a + b, 0), Number.MAX_SAFE_INTEGER);
  for (const r of [[], 'x', [0, 0], [-1, 2], [1.5], ['1']]) {
    assert.equal(code(() => allocate(U(1), r)), 'MONEY_INVALID_RATIO');
  }
});

test('convert', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, rates).minor;
  assert.equal(c(100, 'USD', 'VND'), 25000);
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  const same = U(5);
  const copy = convert(same, 'USD', null);
  assert.deepEqual(copy, same);
  assert.notEqual(copy, same);
  assert.equal(code(() => convert(U(1), 'GBP', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { EUR: {} })), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert(U(1), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: 25000 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: '-1' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(U(1), 'VND', { USD: { VND: '1e3' } })), 'MONEY_INVALID_RATE');
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(
    convertSum([U(100), { minor: 1000, currency: 'VND' }], 'VND', rates),
    { minor: 26000, currency: 'VND' },
  );
  assert.equal(code(() => convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
