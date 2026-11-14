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

// ---- Bổ sung: phủ từng quy tắc / mã lỗi / điểm dễ hiểu nhầm ----

const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `kỳ vọng ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm currency trước minor, -0 thành +0', () => {
  assert.deepEqual(money(5, 'USD'), U(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1.5, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('5', 'USD'), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: locale, dấu âm, ngoặc, token', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('5', { currency: 'USD' }), U(500));
  assert.deepEqual(parseMoney('  $1234567.1 '), U(123456710));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.equal(parseMoney('2.4999', { currency: 'VND' }).minor, 2);
});

test('parseMoney: các mã lỗi và thứ tự kiểm', () => {
  throwsCode(() => parseMoney('5', { locale: 'de-DE', currency: 'XXX' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('£5'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('$5 USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('$-5'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5-', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('(-5)', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('.5', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5.', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1e3', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1,23,456', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1 234', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1,234.5', { locale: 'vi-VN', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('€5', { currency: 'USD' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('90071992547409.92 USD'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(5)), '$0.05');
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
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1, currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('format rồi parse khứ hồi', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const cur of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 123456, -1234567890, 999]) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(3)), U(-2));
  assert.ok(Object.is(subtract(U(3), U(3)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  throwsCode(() => add(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(null, U(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1), 1);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
});

test('multiply làm tròn một lần', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-0.5').minor, -50);
  assert.ok(Object.is(multiply(U(1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', null]) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(5, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ SPEC, dư theo tỉ lệ lớn nhất, số âm, lỗi', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(U(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(U(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(U(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(U(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(U(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(U(1), [0, 0, 5]), [0, 0, 1]);
  const neg = allocate(U(-1), [1, 1]);
  assert.ok(neg.every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(neg.map((p) => p.minor), [-1, 0]);
  assert.ok(allocate(U(7), [1, 1]).every((p) => p.currency === 'USD'));
  const big = allocate(U(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1, 7]);
  assert.equal(big.reduce((s, p) => s + BigInt(p.minor), 0n), BigInt(Number.MAX_SAFE_INTEGER));
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2']]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
});

test('convert: ví dụ SPEC, đơn vị chính, không nghịch đảo', () => {
  const c = (minor, cur, to) => convert({ minor, currency: cur }, to, RATES).minor;
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.equal(c(1000, 'EUR', 'USD'), 1087);
  assert.equal(convert(U(100), 'VND', RATES).currency, 'VND');
});

test('convert: cùng loại tiền không đọc rates, lỗi', () => {
  const same = convert(U(5), 'USD', null);
  assert.deepEqual(same, U(5));
  throwsCode(() => convert(U(5), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(U(5), 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert({ minor: 5, currency: 'VND' }, 'USD', { USD: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(5), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: 25000 } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '-1' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '0' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(5), 'VND', { USD: { VND: '0.0' } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum làm tròn từng khoản rồi cộng', () => {
  const three = [U(100), U(100), U(100)];
  assert.deepEqual(convertSum(three, 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  const mixed = [U(100), { minor: 100, currency: 'EUR' }];
  assert.equal(convertSum(mixed, 'VND', RATES).minor, 25000 + 27000);
  assert.deepEqual(convertSum([U(5)], 'USD', null), U(5));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum(three, 'XXX', RATES), 'MONEY_INVALID_CURRENCY');
});
