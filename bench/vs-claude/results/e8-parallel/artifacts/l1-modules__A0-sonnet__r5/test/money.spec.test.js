import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const U = (minor) => ({ minor, currency: 'USD' });

test('money và lỗi', () => {
  assert.deepEqual(M.money(-0, 'USD'), U(0));
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  assert.equal(code(() => M.money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.money(1.5, 'GBP')), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney', () => {
  const p = M.parseMoney;
  assert.deepEqual(p('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(p('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(p('($5.00)'), U(-500));
  assert.deepEqual(p('- $5'), U(-500));
  assert.deepEqual(p('5.00$'), U(500));
  assert.deepEqual(p('usd 5'), U(500));
  assert.deepEqual(p('1,234', { locale: 'vi-VN', currency: 'USD' }), U(123));
  assert.deepEqual(p('$1.005'), U(100));
  assert.deepEqual(p('$1.015'), U(102));
  assert.deepEqual(p('$1.0051'), U(101));
  assert.deepEqual(p('2.5 VND'), { minor: 2, currency: 'VND' });
  assert.deepEqual(p('3.5 VND'), { minor: 4, currency: 'VND' });
  assert.deepEqual(p('-$0.004'), U(0));
  for (const bad of ['$-5', '5-', '$.5', '$5.', '1e3', '$1,23', '£5', '$5$', '(-$5)']) {
    assert.equal(code(() => p(bad)), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(code(() => p('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => p('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => p('$5', { currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => p('$5', { locale: 'de' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => p(5, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => p('$9007199254740992')), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney và round-trip', () => {
  const f = M.formatMoney;
  assert.equal(f(U(500)), '$5.00');
  assert.equal(f(U(-500)), '-$5.00');
  assert.equal(f(U(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(f(U(500), { display: 'code' }), 'USD 5.00');
  assert.equal(f(U(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(f(U(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(f(U(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(f(U(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(f(U(123456), { display: 'none' }), '1,234.56');
  assert.equal(code(() => f(U(1), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => f(U(1), { locale: 'xx' })), 'MONEY_INVALID_LOCALE');
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const m of [U(0), U(5), U(-123456789), { minor: -1234567, currency: 'VND' }, { minor: 100000, currency: 'EUR' }]) {
      for (const display of ['symbol', 'code']) {
        assert.deepEqual(M.parseMoney(f(m, { locale, display }), { locale }), m);
      }
    }
  }
});

test('add/subtract/compare', () => {
  assert.deepEqual(M.add(U(1), U(2)), U(3));
  assert.deepEqual(M.subtract(U(1), U(1)), U(0));
  assert.equal(M.compare(U(1), U(2)), -1);
  assert.equal(code(() => M.add(U(1), { minor: 1, currency: 'EUR' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.add(U(Number.MAX_SAFE_INTEGER), U(1))), 'MONEY_INVALID_AMOUNT');
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
  assert.equal(M.multiply(U(1005), '0.08').minor, 80);
  assert.equal(M.multiply(U(250), '0.01').minor, 2);
  assert.equal(M.multiply(U(350), '0.01').minor, 4);
  assert.equal(M.multiply(U(1005), '1.1').minor, 1106);
  assert.equal(M.multiply(U(-350), '0.01').minor, -4);
  for (const bad of [2, '1e2', '.5', '5.']) assert.equal(code(() => M.multiply(U(1), bad)), 'MONEY_INVALID_RATE');
});

test('allocate', () => {
  const a = (m, r) => M.allocate(U(m), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  for (const bad of [[], [0, 0], [-1, 2], [1.5], 'x']) assert.equal(code(() => a(1, bad)), 'MONEY_INVALID_RATIO');
});

test('convert và convertSum', () => {
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  const c = (m, to) => M.convert(m, to, rates).minor;
  assert.equal(c(U(100), 'VND'), 25000);
  assert.equal(c(U(300), 'VND'), 75002);
  assert.equal(c(U(1), 'VND'), 250);
  assert.equal(c(U(1000), 'EUR'), 920);
  assert.equal(c(U(5), 'EUR'), 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD'), 4000);
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD'), 0);
  assert.equal(c(U(-300), 'VND'), -75002);
  assert.equal(M.convert(U(5), 'USD', null).minor, 5);
  assert.equal(code(() => M.convert({ minor: 1, currency: 'EUR' }, 'GBP', rates)), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => M.convert(U(1), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(U(1), 'VND', { USD: { VND: 5 } })), 'MONEY_INVALID_RATE');
  assert.equal(M.convertSum([U(100), U(100), U(100)], 'VND', rates).minor, 75000);
  assert.equal(code(() => M.convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});
