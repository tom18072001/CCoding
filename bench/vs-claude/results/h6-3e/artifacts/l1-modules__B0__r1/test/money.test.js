import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (n) => ({ minor: n, currency: 'USD' });
const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `mong đợi ${code}`);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

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

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'XXX'), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('5 usd'), usd(500));
  assert.deepEqual(parseMoney('USD 1234567.5'), usd(123456750));
  assert.deepEqual(parseMoney('5', { currency: 'EUR' }), { minor: 500, currency: 'EUR' });
  assert.deepEqual(parseMoney('-0', { currency: 'USD' }), usd(0));
  assert.ok(Object.is(parseMoney('-0.001', { currency: 'USD' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  const o = { currency: 'USD' };
  assert.equal(parseMoney('1.005', o).minor, 100);
  assert.equal(parseMoney('1.015', o).minor, 102);
  assert.equal(parseMoney('1.0051', o).minor, 101);
  assert.equal(parseMoney('-1.005', o).minor, -100);
  assert.equal(parseMoney('1.0050000', o).minor, 100);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
});

test('parseMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => parseMoney('$5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', ',5', '1e3', '£5', '$5$', '$5€', '', '$', '1,23', '1,2345', '(-5)', '(+5)', '-(5)', '1 234', '$ 1,,234'])
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5 EUR', { currency: 'USD' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => parseMoney('$90071992547409.92'), 'MONEY_INVALID_AMOUNT');
  assert.equal(parseMoney('$90071992547409.91').minor, 9007199254740991);
  throwsCode(() => parseMoney('1.234,5', { locale: 'en-US', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney({ minor: 500, currency: 'EUR' }, { locale: 'fr-FR' }), '5,00 €');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(500), { negative: 'parens' }), '$5.00');
  assert.equal(formatMoney({ minor: 0, currency: 'VND' }), '₫0');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1, currency: 'XXX' }, { locale: 'zz' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney(usd(1.5), { locale: 'zz' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(usd(1), { locale: 'zz', display: 'x' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(usd(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(usd(1), { negative: 'x' }), 'MONEY_INVALID_OPTION');
});

test('format/parse khứ hồi', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR'])
    for (const currency of ['VND', 'USD', 'EUR'])
      for (const minor of [0, 5, -5, 99, 100, 123456, -1234567890, 9007199254740991, -9007199254740991])
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
});

test('add / subtract / compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(1)), usd(0));
  assert.ok(Object.is(subtract(usd(1), usd(1)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(1)), 1);
  assert.equal(compare(usd(2), usd(2)), 0);
  throwsCode(() => add(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(null, usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => add(usd(1), { minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [-1, 3, 0], [5, -2, -2], [-5, -2, 2]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 1), 9007199254740991);
  assert.equal(divideRoundHalfEven(9007199254740989, 2), 4503599627370494);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1.5, 0), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  assert.equal(multiply(usd(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(usd(1), '-0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null])
    throwsCode(() => multiply(usd(1), bad), 'MONEY_INVALID_RATE');
  throwsCode(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply(null, '2'), 'MONEY_INVALID_AMOUNT');
});

test('allocate: thuật toán tỉ lệ lớn nhất', () => {
  const run = (n, r) => allocate(usd(n), r).map((p) => p.minor);
  assert.deepEqual(run(10, [1, 3]), [2, 8]);
  assert.deepEqual(run(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(run(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(run(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(run(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(run(-10, [1, 3]), [-2, -8]);
  assert.deepEqual(run(0, [1, 3]), [0, 0]);
  assert.ok(Object.is(allocate(usd(-1), [0, 1])[0].minor, 0));
  assert.deepEqual(run(9007199254740991, [1, 1]), [4503599627370496, 4503599627370495]);
  assert.equal(allocate({ minor: 5, currency: 'EUR' }, [1])[0].currency, 'EUR');
  for (const bad of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], null])
    throwsCode(() => allocate(usd(10), bad), 'MONEY_INVALID_RATIO');
  throwsCode(() => allocate(null, [1]), 'MONEY_INVALID_AMOUNT');
});

test('convert: ví dụ đặc tả', () => {
  const c = (m, to) => convert(m, to, RATES);
  assert.equal(c(usd(100), 'VND').minor, 25000);
  assert.equal(c(usd(300), 'VND').minor, 75002);
  assert.equal(c(usd(1), 'VND').minor, 250);
  assert.equal(c(usd(1000), 'EUR').minor, 920);
  assert.equal(c(usd(5), 'EUR').minor, 5);
  assert.deepEqual(c({ minor: 1000000, currency: 'VND' }, 'USD'), usd(4000));
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD').minor, 0);
  assert.equal(c(usd(-300), 'VND').minor, -75002);
  assert.equal(c(usd(300), 'VND').currency, 'VND');
});

test('convert: cùng loại, thiếu cặp, tỉ giá sai', () => {
  const src = usd(5);
  const same = convert(src, 'USD', null);
  assert.deepEqual(same, usd(5));
  assert.notEqual(same, src);
  throwsCode(() => convert(usd(5), 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(5), 'EUR', { USD: {} }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(5), 'EUR', {}), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(5), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(5), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', ' 1', ''])
    throwsCode(() => convert(usd(5), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.deepEqual(
    convertSum([usd(100), { minor: 1000, currency: 'VND' }], 'VND', RATES),
    { minor: 26000, currency: 'VND' },
  );
  assert.deepEqual(convertSum([usd(5)], 'USD', null), usd(5));
  throwsCode(() => convertSum([], 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', RATES), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([usd(1)], 'GBP', RATES), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convertSum([{ minor: 1, currency: 'VND' }], 'EUR', RATES), 'MONEY_MISSING_RATE');
});
