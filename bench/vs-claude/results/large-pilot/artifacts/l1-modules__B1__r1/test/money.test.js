import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
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

test('money: thứ tự kiểm lỗi và -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('5', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ trong spec', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('  1234567.1 USD '), usd(123456710));
  assert.ok(Object.is(parseMoney('-$0').minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.equal(parseMoney('0.5 ₫').minor, 0);
  assert.equal(parseMoney('0.50000001 ₫').minor, 1);
});

test('parseMoney: thứ tự và mã lỗi', () => {
  assert.throws(() => parseMoney(5, { locale: 'de-DE', currency: 'XXX' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP 5.'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('£5', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '1,23,456', '1234,567', '(-$5)', '(+$5)', '', '$', '1 234', '--5']) {
    assert.throws(() => parseMoney(bad, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney('1.234,5', { locale: 'en-US', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992', { currency: 'VND' }), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('9007199254740991', { currency: 'VND' }), { minor: 9007199254740991, currency: 'VND' });
  assert.deepEqual(parseMoney('-9007199254740991', { currency: 'VND' }), { minor: -9007199254740991, currency: 'VND' });
});

test('formatMoney: locale, display, negative', () => {
  const m = usd(-500);
  assert.equal(formatMoney(m), '-$5.00');
  assert.equal(formatMoney(m, { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(m, { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(m, { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(m, { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'fr-FR' }), '5,00 USD');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN', display: 'none' }), '1.234,56');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney({ minor: 1500, currency: 'EUR' }, { locale: 'fr-FR' }), '15,00 €');
});

test('formatMoney: thứ tự lỗi', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'zz' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney(usd(1), { locale: 'zz', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('parse(format(m)) khứ hồi', () => {
  const samples = [0, 1, 5, 99, 100, 123456, -1, -123456, 9007199254740991, -9007199254740991];
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
      for (const display of ['symbol', 'code']) {
        for (const minor of samples) {
          const m = { minor, currency };
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(usd(150), usd(250)), usd(400));
  assert.deepEqual(subtract(usd(150), usd(250)), usd(-100));
  assert.ok(Object.is(subtract(usd(5), usd(5)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(1, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => compare(usd(1), { minor: 1.5, currency: 'EUR' }), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [-1, 3, 0]];
  for (const [n, d, want] of cases) assert.equal(divideRoundHalfEven(n, d), want, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER - 1, 2), 4503599627370495);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1.5, 0), code('MONEY_INVALID_AMOUNT'));
});

test('multiply: làm tròn một lần', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(100), '-2'), usd(-200));
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: phát dư theo tỉ lệ lớn nhất', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.deepEqual(mins(usd(0), [1, 3]), [0, 0]);
  assert.ok(allocate(usd(-1), [0, 1, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(allocate({ minor: 7, currency: 'VND' }, [1]), [{ minor: 7, currency: 'VND' }]);
  assert.deepEqual(mins(usd(Number.MAX_SAFE_INTEGER), [1, 1]), [4503599627370496, 4503599627370495]);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2'], null]) {
    assert.throws(() => allocate(usd(10), bad), code('MONEY_INVALID_RATIO'));
  }
});

test('convert', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, RATES);
  assert.equal(c(100, 'USD', 'VND').minor, 25000);
  assert.equal(c(300, 'USD', 'VND').minor, 75002);
  assert.equal(c(1, 'USD', 'VND').minor, 250);
  assert.equal(c(1000, 'USD', 'EUR').minor, 920);
  assert.equal(c(5, 'USD', 'EUR').minor, 5);
  assert.equal(c(1000000, 'VND', 'USD').minor, 4000);
  assert.equal(c(1, 'VND', 'USD').minor, 0);
  assert.equal(c(-300, 'USD', 'VND').minor, -75002);
  assert.ok(Object.is(c(-1, 'VND', 'USD').minor, 0));
});

test('convert: lỗi và cùng loại tiền', () => {
  const m = usd(100);
  const same = convert(m, 'USD', null);
  assert.deepEqual(same, m);
  assert.notEqual(same, m);
  assert.throws(() => convert(m, 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(m, 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'VND', 'x'), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', {}), code('MONEY_MISSING_RATE'));
  // không tự nghịch đảo
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', { EUR: { VND: '27000' } }), code('MONEY_MISSING_RATE'));
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '', null]) {
    assert.throws(() => convert(m, 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'));
  }
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  const three = [usd(100), usd(100), usd(100)];
  assert.deepEqual(convertSum(three, 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.equal(convert(usd(300), 'VND', RATES).minor, 75002);
  const mixed = [usd(100), { minor: 100, currency: 'EUR' }, { minor: 500, currency: 'VND' }];
  assert.deepEqual(convertSum(mixed, 'VND', RATES), { minor: 25000 + 27000 + 500, currency: 'VND' });
  assert.deepEqual(convertSum([usd(1), usd(2)], 'USD', {}), usd(3));
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum(three, 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
});
