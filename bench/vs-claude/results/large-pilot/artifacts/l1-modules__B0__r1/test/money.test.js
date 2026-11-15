import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
const minors = (list) => list.map((p) => p.minor);

test('parse và format USD theo en-US', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
});

test('format VND theo vi-VN', () => {
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }, { locale: 'vi-VN' }), '1.234.567 ₫');
});

test('allocate không mất xu', () => {
  assert.deepEqual(minors(allocate(usd(1000), [1, 1, 1])), [334, 333, 333]);
});

test('convert làm tròn half-even một lần ở cuối', () => {
  const rates = { USD: { VND: '25000.5' } };
  assert.deepEqual(convert(usd(100), 'VND', rates), { minor: 25000, currency: 'VND' });
});

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(-0, 'USD'), usd(0));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'EUR' }), { minor: 123456710, currency: 'EUR' });
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-3.5 VND').minor, -4);
  assert.ok(Object.is(parseMoney('-0.4 VND').minor, 0));
});

test('parseMoney: thứ tự và mã lỗi', () => {
  assert.throws(() => parseMoney(5, { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('abc', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$-5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5-'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('(-5) $'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('(-$5)'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5$'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('£5'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('GBP 5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('GBP x'), code('MONEY_INVALID_AMOUNT'));
  for (const bad of ['.5', '5.', '1e3', '1,23,456', '1,2345', '1234,567', '$']) {
    assert.throws(() => parseMoney(bad, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), bad);
  }
  assert.throws(() => parseMoney('1 234.00', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992 VND'), code('MONEY_INVALID_AMOUNT'));
  assert.equal(parseMoney('9007199254740991 VND').minor, 9007199254740991);
});

test('formatMoney: locale, display, negative', () => {
  const v = { minor: 123456, currency: 'EUR' };
  assert.equal(formatMoney(v, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney(v, { locale: 'vi-VN' }), '1.234,56 €');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(-5), { display: 'none' }), '-0.05');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(5)), '$0.05');
});

test('formatMoney: lỗi theo thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'zz' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'zz' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'zz', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
});

test('parse(format(m)) = m', () => {
  const values = [0, 1, -1, 99, 100, -123456, 1234567891, 9007199254740991, -9007199254740991];
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const currency of ['VND', 'USD', 'EUR']) {
      for (const minor of values) {
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
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(1, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add({ minor: 1, currency: 'XXX' }, usd(1)), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, want] of cases) assert.equal(divideRoundHalfEven(n, d), want, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  // n rất lớn: 9007199254740991 / 2 = 4503599627370495.5 → phần nguyên lẻ → làm tròn lên chẵn
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, 2.5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven('1', 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  assert.equal(multiply(usd(-350), '0.01').minor, -4);
  assert.equal(multiply(usd(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(usd(100), '-0').minor, 0));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  for (const bad of [2, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), bad), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(null, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ trong đặc tả', () => {
  assert.deepEqual(minors(allocate(usd(10), [1, 3])), [2, 8]);
  assert.deepEqual(minors(allocate(usd(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(minors(allocate(usd(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(minors(allocate(usd(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(minors(allocate(usd(-10), [1, 3])), [-2, -8]);
  const parts = allocate({ minor: -1, currency: 'EUR' }, [1, 1]);
  assert.deepEqual(parts, [{ minor: -1, currency: 'EUR' }, { minor: 0, currency: 'EUR' }]);
  assert.ok(Object.is(parts[1].minor, 0));
  assert.deepEqual(minors(allocate(usd(0), [1, 2])), [0, 0]);
});

test('allocate: tổng luôn bằng minor', () => {
  for (const total of [0, 1, 7, 99, 1001, -1001]) {
    for (const ratios of [[1], [1, 1, 1], [5, 0, 2, 2], [9007199254740991, 1]]) {
      const sum = minors(allocate(usd(total), ratios)).reduce((a, b) => a + b, 0);
      assert.equal(sum, total);
    }
  }
});

test('allocate: ratios không hợp lệ', () => {
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], null, 'ab', [NaN]]) {
    assert.throws(() => allocate(usd(10), bad), code('MONEY_INVALID_RATIO'));
  }
});

const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('convert: ví dụ trong đặc tả', () => {
  assert.equal(convert(usd(300), 'VND', rates).minor, 75002);
  assert.equal(convert(usd(1), 'VND', rates).minor, 250);
  assert.deepEqual(convert(usd(1000), 'EUR', rates), { minor: 920, currency: 'EUR' });
  assert.equal(convert(usd(5), 'EUR', rates).minor, 5);
  assert.equal(convert({ minor: 1000000, currency: 'VND' }, 'USD', rates).minor, 4000);
  assert.equal(convert({ minor: 1, currency: 'VND' }, 'USD', rates).minor, 0);
  assert.equal(convert(usd(-300), 'VND', rates).minor, -75002);
});

test('convert: cùng loại tiền, thiếu cặp, tỉ giá sai', () => {
  const same = convert(usd(5), 'USD', null);
  assert.deepEqual(same, usd(5));
  assert.throws(() => convert(usd(5), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(usd(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '']) {
    assert.throws(() => convert(usd(5), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.equal(convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  const mixed = convertSum([usd(100), { minor: 1000000, currency: 'VND' }], 'VND', rates);
  assert.deepEqual(mixed, { minor: 1025000, currency: 'VND' });
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(
    () => convertSum([usd(Number.MAX_SAFE_INTEGER), usd(Number.MAX_SAFE_INTEGER)], 'USD', rates),
    code('MONEY_INVALID_AMOUNT'),
  );
});
