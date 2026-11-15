import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoney,
  formatMoney,
  allocate,
  convert,
  money,
  add,
  subtract,
  compare,
  divideRoundHalfEven,
  multiply,
  convertSum,
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

// ---- Bổ sung ----
const U = (minor) => ({ minor, currency: 'USD' });
const V = (minor) => ({ minor, currency: 'VND' });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `kỳ vọng ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước amount, -0 thành +0', () => {
  assert.deepEqual(money(5, 'USD'), U(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ spec và ba locale', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), V(1234567));
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), U(123456710));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  assert.ok(Object.is(parseMoney('-0.001', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.equal(parseMoney('2.4999 VND').minor, 2);
  assert.equal(parseMoney('2.5001 VND').minor, 3);
});

test('parseMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => parseMoney('5', { locale: 'de-DE', currency: 'XXX' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5 USD', '5. USD', '1e3 USD', '£5', '$5$', '$5 USD', '(-5) USD', '', '1,23,456 USD', '1.234,567 USD', '$ 1 234']) {
    throwsCode(() => parseMoney(bad), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('£5 GBP'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('9007199254740992 VND'), 'MONEY_INVALID_AMOUNT');
  assert.equal(parseMoney('9007199254740991 VND').minor, 9007199254740991);
});

test('formatMoney: ba locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(V(1234567)), '₫1,234,567');
  assert.equal(formatMoney(U(500), { locale: 'vi-VN' }), '5,00 $');
  assert.equal(formatMoney(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(123456), { display: 'none', locale: 'vi-VN' }), '1.234,56');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('format/parse khứ hồi', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const cur of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 99, 100, 123456789, -9007199254740991, 9007199254740991]) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(3)), U(-2));
  assert.ok(Object.is(subtract(U(3), U(3)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const a = U(1);
  assert.notEqual(add(a, U(0)), a);
  throwsCode(() => add(U(1), V(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), V(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), V(1)), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add({ minor: 1.2, currency: 'XXX' }, U(1)), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add(U(1), 5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 3), 3002399751580330);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, 0.5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven('1', 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply: một lần làm tròn', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(250), '-0.01').minor, -2);
  assert.equal(multiply(U(5), '-1').minor, -5);
  assert.ok(Object.is(multiply(U(1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  assert.deepEqual(multiply(U(100), '2'), U(200));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply({ minor: 1, currency: 'XXX' }, 'x'), 'MONEY_INVALID_CURRENCY');
});

test('allocate: thuật toán tỉ lệ lớn nhất nhận dư trước', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(0), [1, 3]), [0, 0]);
  assert.ok(allocate(U(-1), [0, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(allocate(V(9), [1]), [V(9)]);
  const big = mins(U(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0] + big[1], Number.MAX_SAFE_INTEGER);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2'], null]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
});

test('convert: ví dụ spec', () => {
  const c = (m, to) => convert(m, to, RATES);
  assert.equal(c(U(100), 'VND').minor, 25000);
  assert.equal(c(U(300), 'VND').minor, 75002);
  assert.equal(c(U(1), 'VND').minor, 250);
  assert.equal(c(U(1000), 'EUR').minor, 920);
  assert.equal(c(U(5), 'EUR').minor, 5);
  assert.equal(c(V(1000000), 'USD').minor, 4000);
  assert.equal(c(V(1), 'USD').minor, 0);
  assert.equal(c(U(-300), 'VND').minor, -75002);
  assert.ok(Object.is(c(V(-1), 'USD').minor, 0));
  assert.deepEqual(c(U(100), 'VND'), V(25000));
});

test('convert: cùng loại tiền, cặp trực tiếp và lỗi', () => {
  const m = U(7);
  const same = convert(m, 'USD', null);
  assert.deepEqual(same, m);
  assert.notEqual(same, m);
  throwsCode(() => convert(m, 'XXX', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(m, 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(m, 'VND', 'abc'), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(V(7), 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(V(7), 'USD', { USD: { VND: '2' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(m, 'VND', {}), 'MONEY_MISSING_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '']) {
    throwsCode(() => convert(m, 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), V(75000));
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.deepEqual(convertSum([U(100), V(5)], 'VND', RATES), V(25005));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});
