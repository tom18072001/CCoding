import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const usd = (minor) => ({ minor, currency: 'USD' });

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

test('money: thứ tự kiểm, không -0', () => {
  assert.equal(code(() => money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => money(2 ** 53, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
});

test('parseMoney: ví dụ SPEC và định dạng', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
});

test('parseMoney: mã lỗi và thứ tự', () => {
  const c = (t, o) => code(() => parseMoney(t, o));
  assert.equal(c('$5', { locale: 'de' }), 'MONEY_INVALID_LOCALE');
  assert.equal(c(5, { locale: 'de' }), 'MONEY_INVALID_LOCALE');
  assert.equal(c(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  assert.equal(c(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '$5 $', '£5', '1,23,456', '(-5)', '1234,567', '$ 1 234']) {
    assert.equal(c(bad), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(c('5 GBP'), 'MONEY_INVALID_CURRENCY');
  assert.equal(c('GBP 5.'), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('5'), 'MONEY_INVALID_CURRENCY');
  assert.equal(c('€5', { currency: 'USD' }), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(c('90071992547409.92 USD'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(usd(5), { locale: 'fr-FR', display: 'code' }), '0,05 USD');
  assert.equal(code(() => formatMoney(usd(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(usd(1), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => formatMoney(usd(1), { locale: 'x', display: 'x' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => formatMoney(null)), 'MONEY_INVALID_AMOUNT');
});

test('format/parse round-trip', () => {
  const minors = [0, 5, -5, 99, 100, 123456, -1234567890, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const cur of ['VND', 'USD', 'EUR']) {
      for (const minor of minors) {
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.ok(Object.is(subtract(usd(1), usd(1)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.equal(code(() => add(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => compare(usd(1), { minor: 1, currency: 'X' })), 'MONEY_INVALID_CURRENCY');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(code(() => divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => divideRoundHalfEven(1.5, 2)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => divideRoundHalfEven(1, '2')), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  for (const bad of [1, '1e2', '.5', '5.', '+1', '']) {
    assert.equal(code(() => multiply(usd(1), bad)), 'MONEY_INVALID_RATE');
  }
});

test('allocate theo tỉ lệ lớn nhất, không mất xu', () => {
  const a = (m, r) => allocate(usd(m), r).map((p) => p.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(a(0, [1, 2]).every((x) => Object.is(x, 0)));
  assert.ok(Object.is(a(-1, [0, 1])[0], 0));
  for (const m of [-1001, 999, 1]) {
    assert.equal(a(m, [3, 7, 11, 0, 7]).reduce((x, y) => x + y, 0), m);
  }
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1']]) {
    assert.equal(code(() => allocate(usd(1), bad)), 'MONEY_INVALID_RATIO');
  }
});

test('convert: ví dụ SPEC và lỗi', () => {
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  const c = (m, cur, to) => convert({ minor: m, currency: cur }, to, rates).minor;
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.deepEqual(convert(usd(5), 'USD', null), usd(5));
  assert.equal(code(() => convert(usd(5), 'GBP', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => convert(usd(1), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(usd(1), 'VND', { USD: { VND: 25000 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => convert(usd(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
});

test('convertSum đổi từng khoản rồi cộng', () => {
  const rates = { USD: { VND: '25000.5' } };
  assert.equal(convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  assert.equal(code(() => convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
