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
const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `mong đợi ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước minor, -0 thành +0', () => {
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
});

test('parseMoney: ví dụ spec và locale', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), U(123456710));
});

test('parseMoney vi-VN: dấu phẩy là thập phân (1,234 -> 1,23)', () => {
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('1.234', { locale: 'vi-VN', currency: 'USD' }), U(123400));
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney: lỗi cú pháp và thứ tự kiểm lỗi', () => {
  for (const bad of ['$-5', '5-', '.5 USD', '5. USD', '1e3 USD', '$5 USD', '£5', '(-5) USD', '(+5) USD',
    '1,23,456 USD', '12,34 USD', '', '1 234 USD', '$']) {
    throwsCode(() => parseMoney(bad), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('$5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'de-DE', currency: 'X' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'X' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('£5 GBP'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('99999999999999999 USD'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(5)), '$0.05');
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
  assert.equal(formatMoney({ minor: 0, currency: 'EUR' }, { locale: 'fr-FR' }), '0,00 €');
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('formatMoney/parseMoney round-trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const currency of ['VND', 'USD', 'EUR']) {
      for (const minor of [0, 5, -5, 123456, -9007199254740991, 9007199254740991, 1000]) {
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(2)), U(-1));
  assert.ok(Object.is(subtract(U(2), U(2)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  throwsCode(() => add(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add('x', U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_CURRENCY');
  const a = U(1);
  add(a, U(2));
  assert.deepEqual(a, U(1));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740990, 3), 3002399751580330);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
});

test('multiply: làm tròn một lần', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(U(100), '-0.001').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '+1', '', ' 1']) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ spec (dư theo tỉ lệ lớn nhất)', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  const z = allocate(U(-1), [0, 1]);
  assert.ok(Object.is(z[0].minor, 0));
  assert.equal(z[1].currency, 'USD');
  const big = allocate(U(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0].minor + big[1].minor, Number.MAX_SAFE_INTEGER);
});

test('allocate: lỗi tỉ lệ', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2'], undefined]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
  throwsCode(() => allocate(null, [1]), 'MONEY_INVALID_AMOUNT');
});

test('convert: ví dụ spec, tỉ giá theo đơn vị chính', () => {
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.equal(convert(U(1), 'VND', RATES).minor, 250);
  assert.equal(convert(U(1000), 'EUR', RATES).minor, 920);
  assert.equal(convert(U(5), 'EUR', RATES).minor, 5);
  assert.deepEqual(convert({ minor: 1000000, currency: 'VND' }, 'USD', RATES), U(4000));
  assert.equal(convert({ minor: 1, currency: 'VND' }, 'USD', RATES).minor, 0);
  assert.equal(convert(U(-300), 'VND', RATES).minor, -75002);
  assert.equal(convert(U(1000), 'EUR', RATES).currency, 'EUR');
});

test('convert: cùng loại tiền không đọc rates, bản sao mới', () => {
  const a = U(5);
  const r = convert(a, 'USD', null);
  assert.deepEqual(r, a);
  assert.notEqual(r, a);
});

test('convert: lỗi', () => {
  throwsCode(() => convert(U(1), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(U(1), 'VND', { VND: { USD: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '']) {
    throwsCode(() => convert(U(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(U(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  const mixed = [U(100), { minor: 100, currency: 'EUR' }];
  assert.equal(convertSum(mixed, 'VND', RATES).minor, 25000 + 27000);
  assert.deepEqual(convertSum([U(5)], 'USD', RATES), U(5));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});

test('đầu vào không bị thay đổi', () => {
  const m = U(10);
  const ratios = [1, 3];
  const rates = JSON.parse(JSON.stringify(RATES));
  allocate(m, ratios);
  convert(m, 'VND', rates);
  multiply(m, '1.5');
  formatMoney(m);
  assert.deepEqual(m, U(10));
  assert.deepEqual(ratios, [1, 3]);
  assert.deepEqual(rates, RATES);
});
