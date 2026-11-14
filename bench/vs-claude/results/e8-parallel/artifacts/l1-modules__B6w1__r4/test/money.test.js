import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const U = (minor) => ({ minor, currency: 'USD' });

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
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'VND').minor, 0));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money('x', 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
  assert.deepEqual(parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('usd 5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(parseMoney('-0 USD'), { minor: 0, currency: 'USD' });
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  const o = { currency: 'USD' };
  assert.equal(parseMoney('1.005', o).minor, 100);
  assert.equal(parseMoney('1.015', o).minor, 102);
  assert.equal(parseMoney('1.0051', o).minor, 101);
  assert.equal(parseMoney('-1.005', o).minor, -100);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
});

test('parseMoney: lỗi và thứ tự', () => {
  const bad = (t, o, c) => assert.throws(() => parseMoney(t, o), code(c), String(t));
  bad('$5', { locale: 'de-DE' }, 'MONEY_INVALID_LOCALE');
  bad(5, { locale: 'de-DE' }, 'MONEY_INVALID_LOCALE');
  bad(5, { currency: 'GBP' }, 'MONEY_INVALID_CURRENCY');
  bad(5, { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  for (const t of ['$-5', '5-', '.5', '5.', '1e3', '£5', '$5$', '$ 5 USD', '(-5)', '1,23,456', '', '$', '1 234']) {
    bad(t, { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  }
  bad('5 GBP', undefined, 'MONEY_INVALID_CURRENCY');
  bad('5', undefined, 'MONEY_INVALID_CURRENCY');
  bad('$5', { currency: 'EUR' }, 'MONEY_CURRENCY_MISMATCH');
  bad('9007199254740992 VND', undefined, 'MONEY_INVALID_AMOUNT');
  bad('90071992547409.92 USD', undefined, 'MONEY_INVALID_AMOUNT');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(5), {}), '$0.05');
  assert.equal(formatMoney(U(500), { locale: 'vi-VN' }), '5,00 $');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(U(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(U(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(U(1), { locale: 'xx', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(U(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('format/parse round trip', () => {
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
  assert.deepEqual(subtract(U(1), U(1)), U(0));
  assert.ok(Object.is(subtract(U(0), U(0)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  assert.throws(() => add(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-9007199254740991), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(null, U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(U(1), { minor: 1, currency: 'X' }), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -3), 0));
  assert.equal(divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(9007199254740991, 9007199254740990), 1);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(U(1), '-0.1').minor, 0));
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => multiply(U(1), f), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => multiply(U(9007199254740991), '2'), code('MONEY_INVALID_AMOUNT'));
});

test('allocate: ví dụ đặc tả', () => {
  const a = (minor, r) => allocate(U(minor), r).map((p) => p.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.deepEqual(a(0, [1, 1]), [0, 0]);
  assert.ok(allocate(U(-1), [0, 1]).every((p) => p.currency === 'USD'));
  assert.ok(Object.is(allocate(U(-1), [0, 1])[0].minor, 0));
  const big = a(9007199254740991, [1, 1, 1]);
  assert.equal(big.reduce((x, y) => x + y, 0), 9007199254740991);
});

test('allocate: lỗi', () => {
  for (const r of [[], 'x', [0, 0], [-1, 2], [1.5], ['1'], [2 ** 53]]) {
    assert.throws(() => allocate(U(10), r), code('MONEY_INVALID_RATIO'));
  }
});

test('convert: ví dụ đặc tả', () => {
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  assert.equal(convert(U(300), 'VND', rates).minor, 75002);
  assert.equal(convert(U(1), 'VND', rates).minor, 250);
  assert.equal(convert(U(1000), 'EUR', rates).minor, 920);
  assert.equal(convert(U(5), 'EUR', rates).minor, 5);
  assert.equal(convert({ minor: 1000000, currency: 'VND' }, 'USD', rates).minor, 4000);
  assert.equal(convert({ minor: 1, currency: 'VND' }, 'USD', rates).minor, 0);
  assert.equal(convert(U(-300), 'VND', rates).minor, -75002);
  assert.deepEqual(convert(U(100), 'VND', rates), { minor: 25000, currency: 'VND' });
});

test('convert: lỗi', () => {
  const rates = { USD: { VND: '25000.5' } };
  assert.throws(() => convert(U(1), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'USD', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(1), 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(1), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(1), 'VND', { USD: { VND: 25000 } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(1), 'VND', { USD: { VND: '0' } }), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(1), 'VND', { USD: { VND: '-1' } }), code('MONEY_INVALID_RATE'));
  // cùng loại tiền: không đọc rates
  assert.deepEqual(convert(U(7), 'USD', null), U(7));
  assert.notEqual(convert(U(7), 'USD', null), U(7));
});

test('convertSum: làm tròn từng khoản', () => {
  const rates = { USD: { VND: '25000.5' }, EUR: { VND: '27000' } };
  assert.equal(convertSum([U(100), U(100), U(100)], 'VND', rates).minor, 75000);
  assert.equal(convertSum([U(100), { minor: 100, currency: 'EUR' }, { minor: 5, currency: 'VND' }], 'VND', rates).minor, 25000 + 27000 + 5);
  assert.throws(() => convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
