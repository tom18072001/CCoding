import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, allocate, convert } from '../src/money/index.js';

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

// ===== Phần mở rộng =====
import {
  money, add, subtract, compare, divideRoundHalfEven, multiply, convertSum,
} from '../src/money/index.js';

const U = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước minor, không có -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'VND').minor, 0));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ trong SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('usd 5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('+$5.5'), { minor: 550, currency: 'USD' });
  assert.deepEqual(parseMoney('1234567.1 EUR'), { minor: 123456710, currency: 'EUR' });
  assert.deepEqual(parseMoney('5', { currency: 'VND' }), { minor: 5, currency: 'VND' });
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
});

test('parseMoney: lỗi cú pháp và dấu', () => {
  for (const bad of ['$-5', '5-', '.5 USD', '5. USD', '1e3 USD', '£5', '', '$', '(-$5)', '(+$5)',
    '$5 USD', '1,23,456 USD', '1234,567 USD', ',123 USD', '1 234 USD', '$ 5 $']) {
    assert.throws(() => parseMoney(bad), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1,5 $', { locale: 'en-US' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1 234,5 €', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992 VND'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('90071992547409.92 USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: mã lỗi currency/locale và thứ tự kiểm', () => {
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5', { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5 EUR', { currency: 'USD' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(1, { locale: 'xx', currency: 'GBP' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(1, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP x'), code('MONEY_INVALID_AMOUNT'));
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
  assert.equal(formatMoney(U(5), { display: 'none' }), '0.05');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(U(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('formatMoney/parseMoney round-trip', () => {
  for (const cur of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, 5, 99, 100, 123456, -123456, 987654321, -7, Number.MAX_SAFE_INTEGER]) {
      for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(U(100), U(250)), U(350));
  assert.deepEqual(subtract(U(100), U(250)), U(-150));
  assert.ok(Object.is(subtract(U(5), U(5)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const e = { minor: 1, currency: 'EUR' };
  assert.throws(() => add(U(1), e), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(U(1), e), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), e), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(null, U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => compare(U(1), { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4],
    [2, 3, 1], [5, -2, -2], [-5, -2, 2], [1, 2, 0], [-1, 2, 0], [3, 2, 2], [-3, 2, -2], [-1, 3, 0],
    [-2, 4, 0], [-6, 4, -2]];
  for (const [n, d, want] of cases) assert.equal(divideRoundHalfEven(n, d), want, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 3), 3002399751580330);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(2 ** 53, 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply: ví dụ và lỗi', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(-350), '0.01').minor, -4);
  assert.equal(multiply(U(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(U(100), '-0').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(U(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(null, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ SPEC và phần dư theo tỉ lệ lớn nhất', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(0), [1, 3]), [0, 0]);
  assert.ok(Object.is(allocate(U(-1), [0, 1])[0].minor, 0));
  assert.equal(allocate({ minor: 10, currency: 'VND' }, [1, 1])[0].currency, 'VND');
  for (const a of [1, 17, 999, -1234]) {
    const sum = allocate(U(a), [5, 1, 1, 3, 0, 7]).reduce((s, p) => s + p.minor, 0);
    assert.equal(sum, a);
  }
  assert.equal(allocate(U(Number.MAX_SAFE_INTEGER), [1, 1]).reduce((s, p) => s + p.minor, 0), Number.MAX_SAFE_INTEGER);
});

test('allocate: lỗi', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], 'abc', null, [2 ** 53]]) {
    assert.throws(() => allocate(U(10), bad), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(null, [1]), code('MONEY_INVALID_AMOUNT'));
});

test('convert: ví dụ SPEC', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, RATES).minor;
  assert.equal(c(100, 'USD', 'VND'), 25000);
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
});

test('convert: cùng loại tiền không đọc rates; lỗi', () => {
  assert.deepEqual(convert(U(7), 'USD', null), U(7));
  const src = U(7);
  assert.notEqual(convert(src, 'USD', undefined), src);
  assert.throws(() => convert(U(1), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(U(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(1), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'USD', { USD: { VND: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(1), 'VND', {}), code('MONEY_MISSING_RATE'));
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '', null]) {
    assert.throws(() => convert(U(1), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => convert(U(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: đổi và làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  const mixed = [U(100), { minor: 100, currency: 'EUR' }, { minor: 500, currency: 'VND' }];
  assert.equal(convertSum(mixed, 'VND', RATES).minor, 25000 + 27000 + 500);
  assert.deepEqual(convertSum([U(5)], 'USD', null), U(5));
});

test('convertSum: lỗi', () => {
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([U(1)], 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convertSum([U(1)], 'EUR', { USD: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convertSum([U(Number.MAX_SAFE_INTEGER), U(Number.MAX_SAFE_INTEGER)], 'USD', RATES),
    code('MONEY_INVALID_AMOUNT'));
});
