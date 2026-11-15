import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof Error && e.code === code);
const minors = (arr) => arr.map((p) => p.minor);

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  throwsCode(() => money(1, 'GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1, 5), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(2 ** 53, 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money('1', 'USD'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY'); // currency kiểm trước
});

test('parseMoney: ví dụ trong spec', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parseMoney: dấu, token, vị trí', () => {
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('  5 USD  '), usd(500));
  assert.deepEqual(parseMoney('1234567.5', { currency: 'USD' }), usd(123456750));
  assert.deepEqual(parseMoney('-0', { currency: 'USD' }), usd(0));
  assert.ok(Object.is(parseMoney('-0', { currency: 'USD' }).minor, 0));
  assert.ok(Object.is(parseMoney('(0)', { currency: 'USD' }).minor, 0));
  for (const bad of ['$-5', '5-', '(-5)', '(+5)', '$5 $', '$ 5 USD', '£5', '.5', '5.', '1e3', '1,23,456', '1,2345', '', '$', '12 345.00', 'ab5', '1,234.5.6']) {
    throwsCode(() => parseMoney(bad, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  }
  throwsCode(() => parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney('5 £'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  assert.deepEqual(parseMoney('$5', { currency: 'USD' }), usd(500));
});

test('parseMoney: locale và thứ tự kiểm lỗi', () => {
  throwsCode(() => parseMoney(5, { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => parseMoney(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => parseMoney(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1,234.56', { locale: 'vi-VN', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('1 234', { locale: 'en-US', currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => parseMoney('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
  assert.deepEqual(parseMoney('9007199254740991', { currency: 'VND' }), { minor: 9007199254740991, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234', { locale: 'fr-FR', currency: 'VND' }), { minor: 1234, currency: 'VND' });
});

test('parseMoney: làm tròn half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.equal(parseMoney('5.10', { currency: 'VND' }).minor, 5);
  assert.equal(parseMoney('-0.4', { currency: 'VND' }).minor, 0);
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
  assert.equal(formatMoney(usd(500), { display: 'none', locale: 'vi-VN' }), '5,00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: -1000, currency: 'VND' }, { display: 'none' }), '-1,000');
});

test('formatMoney: lỗi và thứ tự', () => {
  throwsCode(() => formatMoney(null), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => formatMoney({ minor: 1.5, currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => formatMoney(usd(1), { locale: 'de-DE', display: 'x' }), 'MONEY_INVALID_LOCALE');
  throwsCode(() => formatMoney(usd(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  throwsCode(() => formatMoney(usd(1), { negative: 'x' }), 'MONEY_INVALID_OPTION');
});

test('format/parse round-trip', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, 99, 100, 123456, -123456, 1234567890, -5, 9007199254740991]) {
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

test('add / subtract / compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(3)), usd(-2));
  assert.ok(Object.is(subtract(usd(3), usd(3)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  throwsCode(() => add(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => compare(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  throwsCode(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add(5, usd(1)), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => add({ minor: 'x', currency: 'XXX' }, usd(1)), 'MONEY_INVALID_CURRENCY');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [-7, 2, -4], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-5, -2, 2], [6, 3, 2]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496 - 0); // 4503599627370495.5 -> chẵn
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  throwsCode(() => divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  throwsCode(() => divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven(1, 2.5), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => divideRoundHalfEven('1', 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(250), '-0.01').minor, -2);
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  assert.deepEqual(multiply(usd(7), '3'), usd(21));
  for (const bad of [1.5, '1e2', '.5', '5.', '+1', '', ' 1', null]) {
    throwsCode(() => multiply(usd(1), bad), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => multiply({ minor: 1, currency: 'X' }, '2'), 'MONEY_INVALID_CURRENCY');
});

test('allocate: ví dụ spec', () => {
  assert.deepEqual(minors(allocate(usd(10), [1, 3])), [2, 8]);
  assert.deepEqual(minors(allocate(usd(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(minors(allocate(usd(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(minors(allocate(usd(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(minors(allocate(usd(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(minors(allocate(usd(-10), [1, 3])), [-2, -8]);
});

test('allocate: bất biến và lỗi', () => {
  const r = allocate({ minor: -1, currency: 'VND' }, [1, 1, 1]);
  assert.deepEqual(minors(r), [-1, 0, 0]);
  assert.ok(r.every((p) => p.currency === 'VND'));
  assert.ok(Object.is(r[1].minor, 0));
  const big = allocate(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]);
  assert.equal(big[0].minor + big[1].minor, Number.MAX_SAFE_INTEGER);
  for (let a = -50; a <= 50; a++) {
    const parts = allocate(usd(a), [3, 0, 5, 5, 2]);
    assert.equal(parts.reduce((s, p) => s + p.minor, 0), a);
    assert.equal(parts[1].minor, 0);
  }
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', null, [1, '2']]) {
    throwsCode(() => allocate(usd(10), bad), 'MONEY_INVALID_RATIO');
  }
  assert.deepEqual(minors(allocate(usd(0), [1, 2])), [0, 0]);
});

const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('convert: ví dụ spec', () => {
  const vnd = (minor) => ({ minor, currency: 'VND' });
  assert.deepEqual(convert(usd(100), 'VND', rates), vnd(25000));
  assert.deepEqual(convert(usd(300), 'VND', rates), vnd(75002));
  assert.deepEqual(convert(usd(1), 'VND', rates), vnd(250));
  assert.deepEqual(convert(usd(1000), 'EUR', rates), { minor: 920, currency: 'EUR' });
  assert.deepEqual(convert(usd(5), 'EUR', rates), { minor: 5, currency: 'EUR' });
  assert.deepEqual(convert(vnd(1000000), 'USD', rates), usd(4000));
  assert.deepEqual(convert(vnd(1), 'USD', rates), usd(0));
  assert.deepEqual(convert(usd(-300), 'VND', rates), vnd(-75002));
  assert.ok(Object.is(convert(vnd(-1), 'USD', rates).minor, 0));
});

test('convert: cùng loại, thiếu/sai tỉ giá', () => {
  const m = usd(100);
  const same = convert(m, 'USD', undefined);
  assert.deepEqual(same, m);
  assert.notEqual(same, m);
  throwsCode(() => convert(m, 'GBP', rates), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert(m, 'GBP', undefined), 'MONEY_INVALID_CURRENCY');
  throwsCode(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates), 'MONEY_MISSING_RATE'); // không qua trung gian
  throwsCode(() => convert(usd(1), 'VND', { EUR: { VND: '1' } }), 'MONEY_MISSING_RATE');
  throwsCode(() => convert(usd(1), 'VND', { VND: { USD: '0.00004' } }), 'MONEY_MISSING_RATE'); // không nghịch đảo
  throwsCode(() => convert(usd(1), 'VND', null), 'MONEY_INVALID_RATE');
  throwsCode(() => convert(usd(1), 'VND', 'x'), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '', null]) {
    throwsCode(() => convert(usd(1), 'VND', { USD: { VND: bad } }), 'MONEY_INVALID_RATE');
  }
  throwsCode(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), 'MONEY_INVALID_AMOUNT');
});

test('convertSum: đổi và làm tròn từng khoản', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(usd(300), 'VND', rates), { minor: 75002, currency: 'VND' });
  assert.deepEqual(
    convertSum([usd(100), { minor: 1000, currency: 'VND' }, usd(1000)], 'VND', { USD: { VND: '25000.5' } }),
    { minor: 25000 + 1000 + 250005, currency: 'VND' },
  );
  throwsCode(() => convertSum([], 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum('x', 'VND', rates), 'MONEY_INVALID_AMOUNT');
  throwsCode(() => convertSum([usd(1)], 'VND', {}), 'MONEY_MISSING_RATE');
});
