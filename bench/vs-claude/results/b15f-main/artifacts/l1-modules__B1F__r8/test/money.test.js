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

// ---- Test bổ sung ----

const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof Error && e.code === code);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước, rồi minor; -0 thành +0', () => {
  assert.deepEqual(money(5, 'VND'), { minor: 5, currency: 'VND' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(NaN, 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('1,234', { locale: 'fr-FR', currency: 'USD' }), U(123));
});

test('parseMoney: dấu, token, vị trí, hoa/thường, cú pháp sai', () => {
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('  usd 5.00  '), U(500));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('5.00 usd'), U(500));
  assert.deepEqual(parseMoney('5', { currency: 'VND' }), { minor: 5, currency: 'VND' });
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  assert.ok(Object.is(parseMoney('-0.001', { currency: 'USD' }).minor, 0));
  assert.deepEqual(parseMoney('1,234,567.5', { currency: 'USD' }), U(123456750));
  for (const bad of ['$-5', '5-', '(-$5)', '(+5)', '$5$', '$ 5 USD', '£5', '.5', '5.', '1e3', '1,23,456', '12,34', '1 000', '', '$', '1,234,5.00']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney(',5', { locale: 'vi-VN', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: mã lỗi và thứ tự kiểm lỗi', () => {
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  assert.deepEqual(parseMoney('$5', { currency: 'USD' }), U(500));
  throwsCode(() => parseMoney('$5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('£5 GBP'), 'MONEY_INVALID_AMOUNT'); // cú pháp xét trước loại tiền
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
  assert.deepEqual(parseMoney('9007199254740991', { currency: 'VND' }), { minor: 9007199254740991, currency: 'VND' });
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.equal(parseMoney('(3.5 VND)').minor, -4);
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
  assert.equal(formatMoney(U(5)), '$0.05');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1, currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney(U(1), { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'x' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'GBP' }, { locale: 'xx' }), 'MONEY_INVALID_CURRENCY');
});

test('parse(format(m)) khứ hồi', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 5, 99, 100, 123456, -1, -123456789, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
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

test('add / subtract / compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(3)), U(-2));
  assert.ok(Object.is(subtract(U(3), U(3)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const e = { minor: 1, currency: 'EUR' };
  throwsCode(() => add(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), e), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(5, U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(1), { minor: 1, currency: 'X' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add(null, { minor: 1, currency: 'X' }), 'MONEY_INVALID_AMOUNT'); // a trước b
  const a = U(1);
  assert.notEqual(add(a, U(0)), a);
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [-1, 3, 0], [5, -2, -2], [-5, -2, 2], [0, 5, 0]];
  for (const [n, d, want] of cases) assert.ok(Object.is(divideRoundHalfEven(n, d), want), `${n}/${d}`);
  // 9007199254740991 / 2 = 4503599627370495,5 → 4503599627370496 (chẵn)
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(divideRoundHalfEven(-Number.MAX_SAFE_INTEGER, 2), -4503599627370496);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, 2.5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven('1', 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(2 ** 53, 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply: ví dụ và lỗi', () => {
  assert.deepEqual(multiply(U(1005), '0.08'), U(80));
  assert.deepEqual(multiply(U(250), '0.01'), U(2));
  assert.deepEqual(multiply(U(350), '0.01'), U(4));
  assert.deepEqual(multiply(U(1005), '1.1'), U(1106));
  assert.deepEqual(multiply(U(-250), '0.01'), U(-2));
  assert.deepEqual(multiply(U(250), '-0.01'), U(-2));
  assert.ok(Object.is(multiply(U(100), '0').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null, undefined]) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(null, '1'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ, biên và lỗi', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(0), [1, 3]), [0, 0]);
  assert.ok(allocate(U(-1), [0, 1]).every((p, i) => Object.is(p.minor, i === 0 ? 0 : -1)));
  assert.deepEqual(mins(U(5), [1]), [5]);
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1, 1]).map((p) => p.currency), ['VND', 'VND']);
  const r = mins(U(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(r[0] + r[1], Number.MAX_SAFE_INTEGER);
  for (const bad of [[], [0], [0, 0], [-1, 2], [1.5], ['1'], 'x', null, [NaN], [2 ** 53]]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
  throwsCode(() => allocate(null, [1]), 'MONEY_INVALID_AMOUNT');
});

test('convert: ví dụ, một lần làm tròn, cặp trực tiếp', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, RATES);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(c(300, 'USD', 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(c(1, 'USD', 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(c(1000, 'USD', 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(c(5, 'USD', 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(c(1000000, 'VND', 'USD'), { minor: 4000, currency: 'USD' });
  assert.ok(Object.is(c(1, 'VND', 'USD').minor, 0));
  assert.deepEqual(c(-300, 'USD', 'VND'), { minor: -75002, currency: 'VND' });
  assert.deepEqual(c(100, 'EUR', 'USD'), { minor: 109, currency: 'USD' }); // 108,7 xu
});

test('convert: lỗi, cùng loại tiền không đọc rates, không nghịch đảo', () => {
  const same = U(7);
  const copy = convert(same, 'USD', null);
  assert.deepEqual(copy, same);
  assert.notEqual(copy, same);
  throwsCode(() => convert(same, 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(same, 'GBP', null), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'EUR' }, 'USD', { USD: { EUR: '0.9' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(same, 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(same, 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(same, 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '1.', '', null]) {
    throwsCode(() => convert(same, 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(null, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convert({ minor: Number.MAX_SAFE_INTEGER, currency: 'EUR' }, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  const three = [U(100), U(100), U(100)];
  assert.deepEqual(convertSum(three, 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(U(300), 'VND', RATES), { minor: 75002, currency: 'VND' });
  const mixed = [U(100), { minor: 1000, currency: 'VND' }, { minor: 100, currency: 'EUR' }];
  assert.deepEqual(convertSum(mixed, 'USD', RATES), { minor: 213, currency: 'USD' }); // 100 + 4 + 109
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum(null, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
});
