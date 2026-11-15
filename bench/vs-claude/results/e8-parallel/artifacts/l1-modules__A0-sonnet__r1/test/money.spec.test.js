import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const usd = (minor) => ({ minor, currency: 'USD' });

test('money và -0', () => {
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  assert.equal(code(() => M.money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.money(1, 'GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.money('x', 'GBP')), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney ví dụ', () => {
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(M.parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(M.parseMoney('- $5'), usd(-500));
  assert.deepEqual(M.parseMoney('5.00$'), usd(500));
  assert.deepEqual(M.parseMoney('usd 5'), usd(500));
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});

test('parseMoney làm tròn half-even trên chuỗi', () => {
  assert.equal(M.parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(M.parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(M.parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(M.parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(M.parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(M.parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.ok(Object.is(M.parseMoney('-0.001', { currency: 'USD' }).minor, 0));
});

test('parseMoney lỗi', () => {
  const c = (t, o) => code(() => M.parseMoney(t, o));
  assert.equal(c('$-5'), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('5-'), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('.5', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('5.', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('1e3', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('$5$'), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('£5'), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('1,23,456', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('(-5)', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('GBP 5'), 'MONEY_INVALID_CURRENCY');
  assert.equal(c('5'), 'MONEY_INVALID_CURRENCY');
  assert.equal(c('€5', { currency: 'USD' }), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(c('5', { locale: 'de-DE' }), 'MONEY_INVALID_LOCALE');
  assert.equal(c(5, { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(c('9007199254740992', { currency: 'VND' }), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(M.formatMoney(usd(500)), '$5.00');
  assert.equal(M.formatMoney(usd(-500)), '-$5.00');
  assert.equal(M.formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(M.formatMoney(usd(500), { locale: 'fr-FR', display: 'code' }), '5,00 USD');
  assert.equal(M.formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(M.formatMoney(usd(123456), { display: 'none' }), '1,234.56');
  assert.equal(code(() => M.formatMoney(usd(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(usd(1), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(usd(1), { locale: 'x' })), 'MONEY_INVALID_LOCALE');
});

test('round-trip format/parse', () => {
  for (const cur of ['VND', 'USD', 'EUR']) {
    for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
      for (const display of ['symbol', 'code']) {
        for (const minor of [0, 5, -5, 100, 123456, -9007199254740991, 9007199254740991, 1000]) {
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
  assert.equal(M.compare(usd(2), usd(2)), 0);
  assert.equal(code(() => M.add(usd(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.add(usd(9007199254740991), usd(1))), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.add(null, usd(1))), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const d = M.divideRoundHalfEven;
  assert.deepEqual([d(5, 2), d(7, 2), d(-5, 2), d(10, 4), d(14, 4), d(2, 3), d(5, -2)], [2, 4, -2, 2, 4, 1, -2]);
  assert.ok(Object.is(d(-1, 3), 0));
  assert.equal(d(9007199254740991, 2), 4503599627370496);
  assert.equal(code(() => d(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => d(1.5, 1)), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(M.multiply(usd(1005), '0.08').minor, 80);
  assert.equal(M.multiply(usd(250), '0.01').minor, 2);
  assert.equal(M.multiply(usd(350), '0.01').minor, 4);
  assert.equal(M.multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(code(() => M.multiply(usd(1), 1.5)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.multiply(usd(1), '.5')), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.multiply(usd(1), '1e2')), 'MONEY_INVALID_RATE');
});

test('allocate', () => {
  const a = (m, r) => M.allocate(usd(m), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(a(-1, [0, 1]).every((x) => !Object.is(x, -0)));
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x']) {
    assert.equal(code(() => a(1, bad)), 'MONEY_INVALID_RATIO');
  }
});

const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };

test('convert', () => {
  const c = (m, to, cur = 'USD') => M.convert({ minor: m, currency: cur }, to, rates).minor;
  assert.equal(c(100, 'VND'), 25000);
  assert.equal(c(300, 'VND'), 75002);
  assert.equal(c(1, 'VND'), 250);
  assert.equal(c(1000, 'EUR'), 920);
  assert.equal(c(5, 'EUR'), 5);
  assert.equal(c(1000000, 'USD', 'VND'), 4000);
  assert.equal(c(1, 'USD', 'VND'), 0);
  assert.equal(c(-300, 'VND'), -75002);
  assert.deepEqual(M.convert(usd(5), 'USD', null), usd(5));
  assert.equal(code(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => M.convert(usd(1), 'EUR', { USD: { EUR: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'EUR', { USD: { EUR: 0.9 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'EUR', 5)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'GBP', rates)), 'MONEY_INVALID_CURRENCY');
});

test('convertSum', () => {
  assert.deepEqual(M.convertSum([usd(100), usd(100), usd(100)], 'VND', rates), { minor: 75000, currency: 'VND' });
  assert.equal(code(() => M.convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
