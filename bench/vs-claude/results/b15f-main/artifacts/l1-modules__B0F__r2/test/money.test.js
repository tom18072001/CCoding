import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, add, subtract, compare, divideRoundHalfEven, multiply, convertSum,
  parseMoney, formatMoney, allocate, convert,
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

// ===== Mở rộng =====
const U = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `mong đợi ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};
const MAXS = Number.MAX_SAFE_INTEGER;

test('money: kiểm currency trước minor, -0 thành +0', () => {
  throwsCode(() => money(1.5, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.deepEqual(money(5, 'EUR'), { minor: 5, currency: 'EUR' });
});

test('parseMoney: ví dụ SPEC', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
});

test('parseMoney: dấu âm, token hai vị trí, mã không phân biệt hoa thường', () => {
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('+$5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('-5 usd'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('eur 5.1'), { minor: 510, currency: 'EUR' });
  assert.deepEqual(parseMoney('  5  ', { currency: 'VND' }), { minor: 5, currency: 'VND' });
  for (const bad of ['$-5', '(-$5)', '(+$5)', '$5 USD', '$5$', '£5']) {
    throwsCode(() => parseMoney(bad), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5-', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: cú pháp phần số', () => {
  for (const bad of ['.5', '5.', '1e3', '1,23,456', '12,34', '1,2345', '1,234.', '', '$', '1 234.56', '1234,567', '1,234.567,8']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney(',5', { locale: 'vi-VN', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1 234', { locale: 'vi-VN', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(parseMoney('1234567', { currency: 'USD' }).minor, 123456700);
  assert.equal(parseMoney('1 234 567,5', { locale: 'fr-FR', currency: 'USD' }).minor, 123456750);
});

test('parseMoney: thứ tự lỗi', () => {
  throwsCode(() => parseMoney(5, { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'en-US', currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('x', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('abc', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('GBP 1e3'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('GBP 5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5 €', { currency: 'USD' }), 'MONEY_CURRENCY_MISMATCH');
  assert.deepEqual(parseMoney('5 $', { currency: 'USD' }), U(500));
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  const p = (s, c = 'USD') => parseMoney(s, { currency: c }).minor;
  assert.equal(p('1.005'), 100);
  assert.equal(p('1.015'), 102);
  assert.equal(p('1.0051'), 101);
  assert.equal(p('1.0049'), 100);
  assert.equal(p('2.5', 'VND'), 2);
  assert.equal(p('3.5', 'VND'), 4);
  assert.equal(p('3.50001', 'VND'), 4);
  assert.equal(p('2.50001', 'VND'), 3);
  assert.equal(p('-1.005'), -100);
  assert.equal(p('-1.015'), -102);
  assert.equal(p('(2.5)', 'VND'), -2);
  assert.equal(p('0.1'), 10);
  assert.ok(Object.is(p('-0.001'), 0));
  assert.ok(Object.is(p('-0'), 0));
});

test('parseMoney: kết quả vượt số nguyên an toàn', () => {
  assert.equal(parseMoney('9007199254740991', { currency: 'VND' }).minor, MAXS);
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('90071992547409.92', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
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
  assert.equal(formatMoney(U(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(500), { negative: 'parens' }), '$5.00');
  assert.equal(formatMoney({ minor: 0, currency: 'VND' }), '₫0');
});

test('formatMoney: thứ tự lỗi m -> locale -> option', () => {
  throwsCode(() => formatMoney(null, { locale: 'xx' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'xx' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'xx' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(U(1), { display: 'bad' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(U(1), { negative: 'bad' }), 'MONEY_INVALID_OPTION');
});

test('formatMoney/parseMoney round trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const currency of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 99, 100, 123456, -1234567, MAXS, -MAXS]) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative: 'parens' }), { locale }), m);
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
  const eur = { minor: 1, currency: 'EUR' };
  throwsCode(() => add(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(U(1), eur), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(null, U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(U(1), { minor: 1, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add(U(MAXS), U(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(U(-MAXS), U(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven: ví dụ SPEC và biên', () => {
  const t = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4], [-7, 2, -4]];
  for (const [n, d, e] of t) assert.equal(divideRoundHalfEven(n, d), e, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(1, -3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(MAXS, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(MAXS, 3), 3002399751580330);
  assert.equal(divideRoundHalfEven(MAXS - 1, 4), 2251799813685248);
  throwsCode(() => divideRoundHalfEven(5, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(5, 0.5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven('5', 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(2 ** 53, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1.5, 0), 'MONEY_INVALID_AMOUNT');
});

test('multiply: ví dụ SPEC, half-even một lần', () => {
  assert.deepEqual(multiply(U(1005), '0.08'), U(80));
  assert.deepEqual(multiply(U(250), '0.01'), U(2));
  assert.deepEqual(multiply(U(350), '0.01'), U(4));
  assert.deepEqual(multiply(U(1005), '1.1'), U(1106));
  assert.deepEqual(multiply(U(-250), '0.01'), U(-2));
  assert.deepEqual(multiply(U(-350), '0.01'), U(-4));
  assert.deepEqual(multiply(U(250), '-0.01'), U(-2));
  assert.ok(Object.is(multiply(U(1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(U(5), '-0').minor, 0));
  assert.deepEqual(multiply(U(3), '2'), U(6));
  assert.equal(multiply(U(MAXS), '1').minor, MAXS);
  assert.equal(multiply(U(MAXS), '0.5').minor, 4503599627370496);
  throwsCode(() => multiply(U(MAXS), '2'), 'MONEY_INVALID_AMOUNT');
});

test('multiply: lỗi', () => {
  for (const bad of [1.5, 2, '1e2', '.5', '5.', '', '+1', ' 1', '1 ', null, undefined]) {
    throwsCode(() => multiply(U(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(null, '1'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(U(1.5), 'x'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: ví dụ SPEC', () => {
  const a = (minor, r) => allocate(U(minor), r).map((p) => p.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
});

test('allocate: tổng bằng m.minor, loại tiền, -0, ratio lớn', () => {
  const parts = allocate({ minor: -7, currency: 'EUR' }, [0, 1, 1]);
  assert.deepEqual(parts, [{ minor: 0, currency: 'EUR' }, { minor: -4, currency: 'EUR' }, { minor: -3, currency: 'EUR' }]);
  assert.ok(Object.is(parts[0].minor, 0));
  assert.ok(allocate(U(0), [1, 2]).every((p) => Object.is(p.minor, 0)));
  assert.deepEqual(allocate(U(5), [5]).map((p) => p.minor), [5]);
  const big = allocate(U(MAXS), [MAXS, MAXS]);
  assert.deepEqual(big.map((p) => p.minor), [4503599627370496, 4503599627370495]);
  for (const total of [1, 2, 3, 99, 101]) {
    assert.equal(allocate(U(total), [1, 1, 1, 0, 5]).reduce((s, p) => s + p.minor, 0), total);
  }
});

test('allocate: MONEY_INVALID_RATIO', () => {
  for (const bad of [[], [0], [0, 0], [-1, 2], [1.5], ['1'], 'x', null, undefined, [1, NaN], [2 ** 53]]) {
    throwsCode(() => allocate(U(10), bad), 'MONEY_INVALID_RATIO');
  }
  throwsCode(() => allocate(null, [1]), 'MONEY_INVALID_AMOUNT');
});

test('convert: ví dụ SPEC', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, RATES).minor;
  assert.equal(c(100, 'USD', 'VND'), 25000);
  assert.equal(c(300, 'USD', 'VND'), 75002);
  assert.equal(c(1, 'USD', 'VND'), 250);
  assert.equal(c(1000, 'USD', 'EUR'), 920);
  assert.equal(c(5, 'USD', 'EUR'), 5);
  assert.equal(c(1000000, 'VND', 'USD'), 4000);
  assert.equal(c(1, 'VND', 'USD'), 0);
  assert.equal(c(-300, 'USD', 'VND'), -75002);
  assert.ok(Object.is(c(-1, 'VND', 'USD'), 0));
});

test('convert: cùng loại tiền, bản sao, không đọc rates', () => {
  const m = U(123);
  const r = convert(m, 'USD', undefined);
  assert.deepEqual(r, m);
  assert.notEqual(r, m);
  assert.deepEqual(convert(m, 'USD', 'x'), m);
  assert.ok(Object.is(convert(U(-0), 'USD', null).minor, 0));
});

test('convert: lỗi', () => {
  throwsCode(() => convert(U(1), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(null, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convert(null, 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', { EUR: { VND: '27000' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', { USD: { EUR: '0.9' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(U(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(U(1), 'VND', undefined), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '5.', '', ' 5']) {
    throwsCode(() => convert(U(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(U(MAXS), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([U(100), U(100), U(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  const mixed = [U(100), { minor: 10, currency: 'EUR' }, { minor: 500, currency: 'VND' }];
  assert.equal(convertSum(mixed, 'VND', RATES).minor, 25000 + 2700 + 500);
});

test('convertSum: lỗi', () => {
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum(null, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum({}, 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convertSum([U(1), null], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([U(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});
