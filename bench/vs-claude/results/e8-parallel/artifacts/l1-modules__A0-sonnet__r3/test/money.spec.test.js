import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const usd = (minor) => ({ minor, currency: 'USD' });

test('money: kiểm tra và -0', () => {
  assert.deepEqual(M.money(-0, 'USD'), usd(0));
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  assert.equal(code(() => M.money(1.5, 'XXX')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(M.parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(M.parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(M.parseMoney('- $5'), usd(-500));
  assert.deepEqual(M.parseMoney('5.00$'), usd(500));
  assert.deepEqual(M.parseMoney('usd 5'), usd(500));
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  assert.equal(M.parseMoney('$1.005').minor, 100);
  assert.equal(M.parseMoney('$1.015').minor, 102);
  assert.equal(M.parseMoney('$1.0051').minor, 101);
  assert.equal(M.parseMoney('2.5 VND').minor, 2);
  assert.equal(M.parseMoney('3.5 VND').minor, 4);
  assert.equal(M.parseMoney('-2.5 VND').minor, -2);
});

test('parseMoney: lỗi', () => {
  assert.equal(code(() => M.parseMoney('$5', { locale: 'de' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => M.parseMoney('5', { currency: 'GBP' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney(5)), 'MONEY_INVALID_AMOUNT');
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '$5 $', '£5', '1,23,4', '(-5)']) {
    assert.equal(code(() => M.parseMoney(bad, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(code(() => M.parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney('$5', { currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.parseMoney('90071992547409.92 USD')), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(M.formatMoney(usd(500)), '$5.00');
  assert.equal(M.formatMoney(usd(-500)), '-$5.00');
  assert.equal(M.formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(M.formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(M.formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(M.formatMoney(usd(1234), { display: 'none' }), '12.34');
  assert.equal(code(() => M.formatMoney(usd(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(usd(1), { locale: 'x' })), 'MONEY_INVALID_LOCALE');
});

test('format/parse khứ hồi', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const cur of ['VND', 'USD', 'EUR']) {
      for (const minor of [0, 5, -5, 99, 100, 123456789, -9007199254740991, 9007199254740991]) {
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency: cur };
          assert.deepEqual(M.parseMoney(M.formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(M.add(usd(1), usd(2)), usd(3));
  assert.deepEqual(M.subtract(usd(1), usd(1)), usd(0));
  assert.equal(M.compare(usd(1), usd(2)), -1);
  assert.equal(code(() => M.add(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.add(usd(Number.MAX_SAFE_INTEGER), usd(1))), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const c = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-1, 3, 0]];
  for (const [n, d, r] of c) assert.ok(Object.is(M.divideRoundHalfEven(n, d), r), `${n}/${d}`);
  assert.equal(M.divideRoundHalfEven(9007199254740991, 2), 4503599627370496);
  assert.equal(code(() => M.divideRoundHalfEven(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => M.divideRoundHalfEven(1.5, 1)), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(M.multiply(usd(1005), '0.08').minor, 80);
  assert.equal(M.multiply(usd(250), '0.01').minor, 2);
  assert.equal(M.multiply(usd(350), '0.01').minor, 4);
  assert.equal(M.multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(M.multiply(usd(5), '-1').minor, -5);
  for (const f of [2, '1e2', '.5', '5.']) assert.equal(code(() => M.multiply(usd(1), f)), 'MONEY_INVALID_RATE');
});

test('allocate', () => {
  const a = (m, r) => M.allocate(usd(m), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  for (const r of [[], [0], [-1, 2], [1.5], 'x']) assert.equal(code(() => a(1, r)), 'MONEY_INVALID_RATIO');
});

test('convert / convertSum', () => {
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  const cv = (m, cur) => M.convert({ minor: m, currency: cur[0] }, cur[1], rates).minor;
  assert.equal(cv(100, ['USD', 'VND']), 25000);
  assert.equal(cv(300, ['USD', 'VND']), 75002);
  assert.equal(cv(1, ['USD', 'VND']), 250);
  assert.equal(cv(1000, ['USD', 'EUR']), 920);
  assert.equal(cv(5, ['USD', 'EUR']), 5);
  assert.equal(cv(1000000, ['VND', 'USD']), 4000);
  assert.equal(cv(1, ['VND', 'USD']), 0);
  assert.equal(cv(-300, ['USD', 'VND']), -75002);
  assert.equal(code(() => M.convert({ minor: 1, currency: 'EUR' }, 'EUR', null)), null);
  assert.equal(code(() => M.convert(usd(1), 'XXX', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', { USD: { VND: 5 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', 5)), 'MONEY_INVALID_RATE');
  assert.deepEqual(M.convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.equal(code(() => M.convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
