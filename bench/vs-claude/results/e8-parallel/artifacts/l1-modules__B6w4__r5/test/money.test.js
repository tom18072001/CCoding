import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const codeOf = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return undefined;
};
const rates = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: kiểm tra và -0', () => {
  assert.deepEqual(money(5, 'USD'), usd(5));
  assert.ok(Object.is(money(-0, 'USD').minor, 0));
  assert.equal(codeOf(() => money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => money(1, 5)), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => money(2 ** 53, 'USD')), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney('5', { currency: 'USD' }), usd(500));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(parseMoney('1.005 USD').minor, 100);
  assert.equal(parseMoney('1.015 USD').minor, 102);
  assert.equal(parseMoney('1.0051 USD').minor, 101);
  assert.equal(parseMoney('2.5 VND').minor, 2);
  assert.equal(parseMoney('3.5 VND').minor, 4);
  assert.equal(parseMoney('-2.5 VND').minor, -2);
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
});

test('parseMoney: lỗi cú pháp', () => {
  for (const bad of ['$-5', '5-', '.5 USD', '5. USD', '1e3 USD', '£5', '$5$', '(-5) USD', '1,23,456 USD', '1 234 USD', '$']) {
    assert.equal(codeOf(() => parseMoney(bad)), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(codeOf(() => parseMoney(5)), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => parseMoney('9007199254740992 VND')), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => parseMoney('$5', { currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(codeOf(() => parseMoney('$5', { locale: 'de-DE' })), 'MONEY_INVALID_LOCALE');
  assert.equal(codeOf(() => parseMoney(5, { locale: 'de-DE' })), 'MONEY_INVALID_LOCALE');
  assert.equal(codeOf(() => parseMoney(5, { currency: 'XXX' })), 'MONEY_INVALID_CURRENCY');
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(formatMoney({ minor: 123456, currency: 'EUR' }, { locale: 'fr-FR' }), '1 234,56 €');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(500), { locale: 'fr-FR', display: 'code' }), '5,00 USD');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
});

test('formatMoney: lỗi và thứ tự kiểm', () => {
  assert.equal(codeOf(() => formatMoney(null)), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => formatMoney({ minor: 1.5, currency: 'XXX' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => formatMoney(usd(1), { locale: 'xx', display: 'bad' })), 'MONEY_INVALID_LOCALE');
  assert.equal(codeOf(() => formatMoney(usd(1), { display: 'bad' })), 'MONEY_INVALID_OPTION');
  assert.equal(codeOf(() => formatMoney(usd(1), { negative: 'bad' })), 'MONEY_INVALID_OPTION');
});

test('format rồi parse cho lại đúng giá trị', () => {
  for (const cur of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 5, -5, 123456, -9007199254740991, 9007199254740991]) {
      for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
        for (const display of ['symbol', 'code']) {
          for (const negative of ['sign', 'parens']) {
            const m = { minor, currency: cur };
            assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative }), { locale }), m);
          }
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(add(usd(1), usd(2)), usd(3));
  assert.deepEqual(subtract(usd(1), usd(2)), usd(-1));
  assert.ok(Object.is(subtract(usd(2), usd(2)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  assert.equal(codeOf(() => add(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(codeOf(() => compare(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(codeOf(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => add(null, usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => add(usd(1), { minor: 1, currency: 'XXX' })), 'MONEY_INVALID_CURRENCY');
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [-1, 3, 0], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, want] of cases) assert.ok(Object.is(divideRoundHalfEven(n, d), want), `${n}/${d}`);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(codeOf(() => divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(codeOf(() => divideRoundHalfEven(1.5, 2)), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => divideRoundHalfEven(1, '2')), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-250), '0.01').minor, -2);
  assert.equal(multiply(usd(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(usd(100), '0').minor, 0));
  for (const bad of [1.5, '1e2', '.5', '5.', '', '+1']) {
    assert.equal(codeOf(() => multiply(usd(1), bad)), 'MONEY_INVALID_RATE');
  }
  assert.equal(codeOf(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2')), 'MONEY_INVALID_AMOUNT');
});

test('allocate', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  assert.ok(allocate(usd(-1), [1, 0]).every((p) => !Object.is(p.minor, -0)));
  assert.ok(allocate(usd(-1), [0, 1]).every((p) => !Object.is(p.minor, -0)));
  assert.equal(allocate(usd(5), [1]).length, 1);
  assert.equal(allocate({ minor: 5, currency: 'VND' }, [1, 1])[0].currency, 'VND');
  const big = mins(usd(Number.MAX_SAFE_INTEGER), [1, 1, 1]);
  assert.equal(big.reduce((a, b) => a + b, 0), Number.MAX_SAFE_INTEGER);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2']]) {
    assert.equal(codeOf(() => allocate(usd(5), bad)), 'MONEY_INVALID_RATIO');
  }
});

test('convert', () => {
  const c = (minor, from, to) => convert({ minor, currency: from }, to, rates);
  assert.deepEqual(c(100, 'USD', 'VND'), { minor: 25000, currency: 'VND' });
  assert.equal(c(300, 'USD', 'VND').minor, 75002);
  assert.equal(c(1, 'USD', 'VND').minor, 250);
  assert.equal(c(1000, 'USD', 'EUR').minor, 920);
  assert.equal(c(5, 'USD', 'EUR').minor, 5);
  assert.equal(c(1000000, 'VND', 'USD').minor, 4000);
  assert.equal(c(1, 'VND', 'USD').minor, 0);
  assert.equal(c(-300, 'USD', 'VND').minor, -75002);
  assert.ok(Object.is(c(-1, 'VND', 'USD').minor, 0));
});

test('convert: cùng loại tiền, thiếu tỉ giá, tỉ giá sai', () => {
  const m = usd(7);
  const same = convert(m, 'USD', null);
  assert.deepEqual(same, m);
  assert.notEqual(same, m);
  assert.equal(codeOf(() => convert(m, 'XXX', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(codeOf(() => convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(codeOf(() => convert(m, 'VND', { EUR: {} })), 'MONEY_MISSING_RATE');
  assert.equal(codeOf(() => convert(m, 'VND', 'x')), 'MONEY_INVALID_RATE');
  assert.equal(codeOf(() => convert(m, 'VND', null)), 'MONEY_INVALID_RATE');
  for (const bad of [25000, '0', '0.0', '-1', '1e3', '.5', '']) {
    assert.equal(codeOf(() => convert(m, 'VND', { USD: { VND: bad } })), 'MONEY_INVALID_RATE', String(bad));
  }
  assert.equal(codeOf(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000000' } })), 'MONEY_INVALID_AMOUNT');
});

test('convertSum đổi từng khoản rồi cộng', () => {
  const list = [usd(100), usd(100), usd(100)];
  assert.deepEqual(convertSum(list, 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.equal(convert(usd(300), 'VND', rates).minor, 75002);
  assert.deepEqual(
    convertSum([usd(100), { minor: 5000, currency: 'VND' }], 'VND', rates),
    { minor: 30000, currency: 'VND' },
  );
  assert.equal(codeOf(() => convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(codeOf(() => convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
