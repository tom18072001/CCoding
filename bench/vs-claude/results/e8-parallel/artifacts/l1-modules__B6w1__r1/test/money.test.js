import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const U = (minor) => ({ minor, currency: 'USD' });
const code = (c) => (e) => e.code === c;
const minors = (a) => a.map((p) => p.minor);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: hợp lệ, -0, thứ tự kiểm lỗi', () => {
  assert.deepEqual(money(1050, 'USD'), U(1050));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(parseMoney('$1,234.56'), U(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), U(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(parseMoney('5.00$'), U(500));
  assert.deepEqual(parseMoney('usd 5'), U(500));
  assert.deepEqual(parseMoney('- $5'), U(-500));
  assert.deepEqual(parseMoney('+$5'), U(500));
  assert.deepEqual(parseMoney('1234567.1', { currency: 'USD' }), U(123456710));
  assert.ok(Object.is(parseMoney('-$0').minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('$1.005').minor, 100);
  assert.equal(parseMoney('$1.015').minor, 102);
  assert.equal(parseMoney('$1.0051').minor, 101);
  assert.equal(parseMoney('2.5 ₫').minor, 2);
  assert.equal(parseMoney('3.5 ₫').minor, 4);
  assert.equal(parseMoney('-2.5 ₫').minor, -2);
  assert.equal(parseMoney('-3.5 ₫').minor, -4);
});

test('parseMoney: lỗi cú pháp và thứ tự kiểm lỗi', () => {
  const bad = ['$-5', '5-', '.5', '5.', '1e3', '$', '', '£5', '$5$', '$ 5 €', '(-5)', '1,23,4', '1,2345', '$5 5', '1 234.00'];
  for (const t of bad) assert.throws(() => parseMoney(t, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'), t);
  assert.throws(() => parseMoney(5, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1,234.5', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5', {}), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP 5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5', { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('$5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
  // locale được kiểm trước currency và text
  assert.throws(() => parseMoney(5, { locale: 'xx', currency: 'GBP' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  // cú pháp trước loại tiền
  assert.throws(() => parseMoney('GBP 5..0'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$9007199254740992', {}), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('90071992547409.92 $'), code('MONEY_INVALID_AMOUNT'));
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(U(500)), '$5.00');
  assert.equal(formatMoney(U(123456)), '$1,234.56');
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
  assert.equal(formatMoney(U(-500)), '-$5.00');
  assert.equal(formatMoney(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(U(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(U(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney(U(5)), '$0.05');
});

test('formatMoney: lỗi và thứ tự', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1, currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(U(1), { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(U(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(U(1), { locale: 'xx', display: 'x' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
});

test('format rồi parse khứ hồi', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 5, -5, 99, 100, 123456, -1234567, 9007199254740991, -9007199254740991]) {
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

test('add, subtract, compare', () => {
  assert.deepEqual(add(U(1), U(2)), U(3));
  assert.deepEqual(subtract(U(1), U(3)), U(-2));
  assert.ok(Object.is(subtract(U(3), U(3)).minor, 0));
  assert.equal(compare(U(1), U(2)), -1);
  assert.equal(compare(U(2), U(2)), 0);
  assert.equal(compare(U(3), U(2)), 1);
  const a = U(1);
  assert.notEqual(add(a, U(0)), a);
  assert.throws(() => add(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(U(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(U(Number.MAX_SAFE_INTEGER), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(U(-Number.MAX_SAFE_INTEGER), U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(5, U(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(U(1), { minor: 1, currency: 'X' }), code('MONEY_INVALID_CURRENCY'));
  // a được kiểm trước b
  assert.throws(() => add({ minor: 1, currency: 'X' }, null), code('MONEY_INVALID_CURRENCY'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [9, 3, 3]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -3), 0));
  // chính xác với n rất lớn
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER - 2, 2), 4503599627370494);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 3), 3002399751580330);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(2 ** 60, 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(multiply(U(1005), '0.08').minor, 80);
  assert.equal(multiply(U(250), '0.01').minor, 2);
  assert.equal(multiply(U(350), '0.01').minor, 4);
  assert.equal(multiply(U(1005), '1.1').minor, 1106);
  assert.equal(multiply(U(-250), '0.01').minor, -2);
  assert.equal(multiply(U(100), '-1.5').minor, -150);
  assert.ok(Object.is(multiply(U(100), '-0').minor, 0));
  assert.ok(Object.is(multiply(U(-1), '0.1').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', '1,5', null]) {
    assert.throws(() => multiply(U(1), bad), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => multiply(U(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply({ minor: 1, currency: 'X' }, 'x'), code('MONEY_INVALID_CURRENCY'));
});

test('allocate: thuật toán tỉ lệ lớn nhất', () => {
  assert.deepEqual(minors(allocate(U(10), [1, 3])), [2, 8]);
  assert.deepEqual(minors(allocate(U(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(minors(allocate(U(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(minors(allocate(U(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(minors(allocate(U(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(minors(allocate(U(-10), [1, 3])), [-2, -8]);
  assert.deepEqual(minors(allocate(U(0), [1, 3])), [0, 0]);
  assert.ok(allocate(U(-1), [0, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.deepEqual(allocate({ minor: 3, currency: 'VND' }, [1, 1])[0].currency, 'VND');
  // tổng đúng, số lớn không tràn
  const big = allocate(U(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1, 7]);
  assert.equal(big.reduce((s, p) => s + p.minor, 0), Number.MAX_SAFE_INTEGER);
  for (let a = -50; a <= 50; a++) {
    const parts = allocate(U(a), [3, 1, 4, 1, 5]);
    assert.equal(parts.reduce((s, p) => s + p.minor, 0), a);
  }
  for (const bad of [[], [0, 0], [-1, 2], [1.5], ['1'], null, 'abc', [Infinity]]) {
    assert.throws(() => allocate(U(10), bad), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(null, [1]), code('MONEY_INVALID_AMOUNT'));
});

test('convert: làm tròn một lần ở đơn vị đích', () => {
  assert.deepEqual(convert(U(100), 'VND', RATES), { minor: 25000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  assert.equal(convert(U(1), 'VND', RATES).minor, 250);
  assert.deepEqual(convert(U(1000), 'EUR', RATES), { minor: 920, currency: 'EUR' });
  assert.equal(convert(U(5), 'EUR', RATES).minor, 5);
  assert.equal(convert({ minor: 1000000, currency: 'VND' }, 'USD', RATES).minor, 4000);
  assert.equal(convert({ minor: 1, currency: 'VND' }, 'USD', RATES).minor, 0);
  assert.equal(convert(U(-300), 'VND', RATES).minor, -75002);
  assert.equal(convert({ minor: 100, currency: 'EUR' }, 'VND', RATES).minor, 27000);
});

test('convert: cùng loại tiền, thiếu cặp, tỉ giá sai', () => {
  const same = convert(U(5), 'USD', null);
  assert.deepEqual(same, U(5));
  assert.notEqual(same, undefined);
  assert.throws(() => convert(U(5), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  // không nghịch đảo, không qua trung gian
  assert.throws(() => convert({ minor: 5, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 5, currency: 'EUR' }, 'USD', { USD: { EUR: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(5), 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(U(5), 'VND', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(U(5), 'VND', 'x'), code('MONEY_INVALID_RATE'));
  for (const bad of [25000, '0', '0.00', '-1', '1e3', '.5', '5.', '', null]) {
    assert.throws(() => convert(U(5), 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => convert(U(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: đổi từng khoản rồi cộng', () => {
  const r = convertSum([U(100), U(100), U(100)], 'VND', RATES);
  assert.deepEqual(r, { minor: 75000, currency: 'VND' });
  assert.equal(convert(U(300), 'VND', RATES).minor, 75002);
  const mixed = convertSum([U(100), { minor: 100, currency: 'EUR' }, { minor: 5, currency: 'VND' }], 'VND', RATES);
  assert.equal(mixed.minor, 25000 + 27000 + 5);
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([U(1)], 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convertSum([U(Number.MAX_SAFE_INTEGER), U(Number.MAX_SAFE_INTEGER)], 'USD', RATES), code('MONEY_INVALID_AMOUNT'));
});
