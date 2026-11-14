import test from 'node:test';
import assert from 'node:assert/strict';
import { money, add, subtract, compare, divideRoundHalfEven, multiply, convertSum, parseMoney, formatMoney, allocate, convert } from '../src/money/index.js';

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

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: hợp lệ, -0 thành +0, thứ tự lỗi currency trước minor', () => {
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven: .5 dương/âm, d âm, không -0, số lớn, lỗi', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2]];
  for (const [n, d, e] of cases) assert.equal(divideRoundHalfEven(n, d), e);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: locale, dấu, token, làm tròn', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('1.005', { currency: 'USD' }), usd(100));
  assert.deepEqual(parseMoney('1.015', { currency: 'USD' }), usd(102));
  assert.deepEqual(parseMoney('1.0051', { currency: 'USD' }), usd(101));
  assert.deepEqual(parseMoney('-1.005', { currency: 'USD' }), usd(-100));
  assert.deepEqual(parseMoney('2.5 VND'), { minor: 2, currency: 'VND' });
  assert.deepEqual(parseMoney('3.5 VND'), { minor: 4, currency: 'VND' });
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
  assert.deepEqual(parseMoney('1234567.89 USD'), usd(123456789));
});

test('parseMoney: các mã lỗi', () => {
  const bad = (t, o, c) => assert.throws(() => parseMoney(t, o), code(c), String(t));
  bad('$5', { locale: 'xx' }, 'MONEY_INVALID_LOCALE');
  bad('$5', { currency: 'GBP' }, 'MONEY_INVALID_CURRENCY');
  bad(5, {}, 'MONEY_INVALID_AMOUNT');
  bad('$-5', {}, 'MONEY_INVALID_AMOUNT');
  bad('5-', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('(-5)', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('$5$', {}, 'MONEY_INVALID_AMOUNT');
  bad('.5', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5.', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1e3', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('£5', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,23,456', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1 234', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5 GBP', {}, 'MONEY_INVALID_CURRENCY');
  bad('5', {}, 'MONEY_INVALID_CURRENCY');
  bad('$5', { currency: 'EUR' }, 'MONEY_CURRENCY_MISMATCH');
  bad('90071992547409.92 USD', {}, 'MONEY_INVALID_AMOUNT');
  // thứ tự: locale > currency > kiểu text > cú pháp > loại tiền
  bad(5, { locale: 'xx', currency: 'GBP' }, 'MONEY_INVALID_LOCALE');
  bad(5, { currency: 'GBP' }, 'MONEY_INVALID_CURRENCY');
  bad('£', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5 GBP $', {}, 'MONEY_INVALID_AMOUNT');
  bad('abc', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: từng locale/display/negative và roundtrip', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(500), { locale: 'vi-VN' }), '5,00 $');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const cur of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 7, -7, 123456789, -1000]) {
          const m = { minor, currency: cur };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'xx' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('add/subtract/compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(3)), usd(-2));
  assert.ok(Object.is(subtract(usd(3), usd(3)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  const a = usd(1);
  assert.notEqual(add(a, usd(0)), a);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(9007199254740991), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-9007199254740991), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(5, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => add({ minor: 1, currency: 'EUR' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
});

test('multiply: một lần làm tròn, âm, lỗi', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(100), '-2'), usd(-200));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1']) {
    assert.throws(() => multiply(usd(1), f), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(9007199254740991), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: phần dư theo tỉ lệ lớn nhất, tỉ lệ 0, âm, lỗi', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1]), [{ minor: 3, currency: 'VND' }]);
  assert.ok(Object.is(mins(usd(-1), [1, 0])[1], 0));
  for (const r of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], [NaN]]) {
    assert.throws(() => allocate(usd(1), r), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(usd(1.5), []), code('MONEY_INVALID_AMOUNT'));
});

test('convert: một lần làm tròn, ví dụ SPEC, lỗi', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, RATES);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(c(300, 'USD', 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(c(1, 'USD', 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(c(1000, 'USD', 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(c(5, 'USD', 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(c(1000000, 'VND', 'USD'), { minor: 4000, currency: 'USD' });
  assert.deepEqual(c(1, 'VND', 'USD'), { minor: 0, currency: 'USD' });
  assert.deepEqual(c(-300, 'USD', 'VND'), { minor: -75002, currency: 'VND' });
  assert.ok(Object.is(c(-1, 'VND', 'USD').minor, 0));
  const src = usd(5);
  const copy = convert(src, 'USD', null);
  assert.deepEqual(copy, src);
  assert.notEqual(copy, src);
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(1), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const r of ['0', '0.0', 25000, '-1', '1e3', '.5', '']) {
    assert.throws(() => convert(usd(1), 'VND', { USD: { VND: r } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => convert(usd(1), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(1.5), 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convert(usd(9007199254740991), 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convert(usd(1.5), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
});

test('convertSum: làm tròn từng khoản rồi cộng, lỗi', () => {
  const rates = { USD: { VND: '25000.5' } };
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(usd(300), 'VND', rates), { minor: 75002, currency: 'VND' });
  assert.deepEqual(
    convertSum([usd(100), { minor: 7, currency: 'VND' }], 'VND', rates),
    { minor: 25007, currency: 'VND' },
  );
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'VND', {}), code('MONEY_MISSING_RATE'));
});
