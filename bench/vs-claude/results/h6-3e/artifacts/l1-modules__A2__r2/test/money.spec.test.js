import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };

test('money và -0', () => {
  assert.deepEqual(M.money(-0, 'USD'), usd(0));
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  assert.equal(code(() => M.money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.money(1, 'GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.money(1.5, 'GBP')), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney ví dụ', () => {
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(M.parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(M.parseMoney('- $5'), usd(-500));
  assert.deepEqual(M.parseMoney('5.00$'), usd(500));
  assert.deepEqual(M.parseMoney('usd 5'), usd(500));
  assert.deepEqual(M.parseMoney('1.005', { currency: 'USD' }), usd(100));
  assert.deepEqual(M.parseMoney('1.015', { currency: 'USD' }), usd(102));
  assert.deepEqual(M.parseMoney('1.0051', { currency: 'USD' }), usd(101));
  assert.equal(M.parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(M.parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.ok(Object.is(M.parseMoney('-0.001', { currency: 'USD' }).minor, 0));
});

test('parseMoney lỗi', () => {
  const p = (t, o) => code(() => M.parseMoney(t, o));
  assert.equal(p('$-5'), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('5-', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('.5', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('5.', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('1e3', { currency: 'USD' }), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('$5€'), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('£5'), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('GBP 5'), 'MONEY_INVALID_CURRENCY');
  assert.equal(p('5'), 'MONEY_INVALID_CURRENCY');
  assert.equal(p('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(p('$5', { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  assert.equal(p(5, { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  assert.equal(p(5, { currency: 'XXX' }), 'MONEY_INVALID_CURRENCY');
  assert.equal(p(5), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('(-$5)'), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('1,23,456'), 'MONEY_INVALID_AMOUNT');
  assert.equal(p('$9,007,199,254,740,992.00'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(M.formatMoney(usd(500)), '$5.00');
  assert.equal(M.formatMoney(usd(-500)), '-$5.00');
  assert.equal(M.formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(M.formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney(usd(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(M.formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(M.formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(code(() => M.formatMoney(usd(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(usd(1), { locale: 'x', display: 'x' })), 'MONEY_INVALID_LOCALE');
  const samples = [usd(0), usd(-1), usd(123456789), { minor: -9007199254740991, currency: 'VND' }, { minor: 100, currency: 'EUR' }];
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const m of samples) {
        assert.deepEqual(M.parseMoney(M.formatMoney(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(M.add(usd(1), usd(2)), usd(3));
  assert.deepEqual(M.subtract(usd(1), usd(1)), usd(0));
  assert.equal(M.compare(usd(1), usd(2)), -1);
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
});

test('allocate', () => {
  const a = (n, r) => M.allocate(usd(n), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(M.allocate(usd(-1), [0, 1]).every((x) => !Object.is(x.minor, -0)));
  assert.equal(code(() => a(1, [0, 0])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => a(1, [])), 'MONEY_INVALID_RATIO');
  assert.equal(code(() => a(1, [-1, 2])), 'MONEY_INVALID_RATIO');
});

test('convert / convertSum', () => {
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  const c = (m, to) => M.convert(m, to, rates).minor;
  assert.equal(c(usd(100), 'VND'), 25000);
  assert.equal(c(usd(300), 'VND'), 75002);
  assert.equal(c(usd(1), 'VND'), 250);
  assert.equal(c(usd(1000), 'EUR'), 920);
  assert.equal(c(usd(5), 'EUR'), 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD'), 4000);
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD'), 0);
  assert.equal(c(usd(-300), 'VND'), -75002);
  assert.deepEqual(M.convert(usd(5), 'USD', null), usd(5));
  assert.equal(code(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', { USD: { VND: 5 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(usd(1), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(M.convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  assert.equal(code(() => M.convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
