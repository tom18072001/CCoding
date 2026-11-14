import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const code = (fn, c) => assert.throws(fn, (e) => e.code === c);

test('money: kiểm tra đầu vào, -0', () => {
  assert.deepEqual(M.money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  code(() => M.money(1.5, 'XXX'), 'MONEY_INVALID_CURRENCY');
  code(() => M.money(1.5, 'USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.money(1, 5), 'MONEY_INVALID_CURRENCY');
});

test('parseMoney: ví dụ đặc tả', () => {
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(M.parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(M.parseMoney('- $5'), usd(-500));
  assert.deepEqual(M.parseMoney('5.00$'), usd(500));
  assert.deepEqual(M.parseMoney('usd 5'), usd(500));
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(M.parseMoney('1.005', { currency: 'USD' }), usd(100));
  assert.deepEqual(M.parseMoney('1.015', { currency: 'USD' }), usd(102));
  assert.deepEqual(M.parseMoney('1.0051', { currency: 'USD' }), usd(101));
  assert.equal(M.parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(M.parseMoney('-3.5', { currency: 'VND' }).minor, -4);
});

test('parseMoney: lỗi', () => {
  code(() => M.parseMoney('$5', { locale: 'xx' }), 'MONEY_INVALID_LOCALE');
  code(() => M.parseMoney('$5', { currency: 'GBP' }), 'MONEY_INVALID_CURRENCY');
  code(() => M.parseMoney(5), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('$-5'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('5-'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('$5$'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('£5'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('.5 USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('5. USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('1e3 USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('1,23,456 USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('(-5) USD'), 'MONEY_INVALID_AMOUNT');
  code(() => M.parseMoney('5 GBP'), 'MONEY_INVALID_CURRENCY');
  code(() => M.parseMoney('5'), 'MONEY_INVALID_CURRENCY');
  code(() => M.parseMoney('$5', { currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  code(() => M.parseMoney('99999999999999999 VND'), 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(M.formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(M.formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(M.formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(M.formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  code(() => M.formatMoney(usd(1), { display: 'x' }), 'MONEY_INVALID_OPTION');
  code(() => M.formatMoney(usd(1), { locale: 'x' }), 'MONEY_INVALID_LOCALE');
});

test('format/parse round trip', () => {
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const currency of ['VND', 'USD', 'EUR']) {
        for (const minor of [0, 5, -5, 123456, -1234567890, Number.MAX_SAFE_INTEGER]) {
          const m = { minor, currency };
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
  code(() => M.add(usd(1), { minor: 1, currency: 'EUR' }), 'MONEY_CURRENCY_MISMATCH');
  code(() => M.add(usd(Number.MAX_SAFE_INTEGER), usd(1)), 'MONEY_INVALID_AMOUNT');
  code(() => M.add(null, usd(1)), 'MONEY_INVALID_AMOUNT');
});

test('divideRoundHalfEven', () => {
  const r = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-1, 3, 0]];
  for (const [n, d, e] of r) assert.ok(Object.is(M.divideRoundHalfEven(n, d), e), `${n}/${d}`);
  assert.equal(M.divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  code(() => M.divideRoundHalfEven(1, 0), 'MONEY_DIVIDE_BY_ZERO');
  code(() => M.divideRoundHalfEven(1.5, 2), 'MONEY_INVALID_AMOUNT');
});

test('multiply', () => {
  assert.equal(M.multiply(usd(1005), '0.08').minor, 80);
  assert.equal(M.multiply(usd(250), '0.01').minor, 2);
  assert.equal(M.multiply(usd(350), '0.01').minor, 4);
  assert.equal(M.multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(M.multiply(usd(-250), '0.01').minor, -2);
  for (const f of [1, '1e2', '.5', '5.', '+1']) code(() => M.multiply(usd(1), f), 'MONEY_INVALID_RATE');
});

test('allocate', () => {
  const p = (m, r) => M.allocate(usd(m), r).map((x) => x.minor);
  assert.deepEqual(p(10, [1, 3]), [2, 8]);
  assert.deepEqual(p(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(p(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(p(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(p(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(p(-10, [1, 3]), [-2, -8]);
  assert.ok(Object.is(p(-1, [0, 1])[0], 0));
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'x']) code(() => M.allocate(usd(1), r), 'MONEY_INVALID_RATIO');
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
  assert.deepEqual(M.convert(usd(7), 'USD', null), usd(7));
  code(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates), 'MONEY_MISSING_RATE');
  code(() => M.convert(usd(1), 'VND', null), 'MONEY_INVALID_RATE');
  code(() => M.convert(usd(1), 'VND', { USD: { VND: '0' } }), 'MONEY_INVALID_RATE');
  code(() => M.convert(usd(1), 'VND', { USD: { VND: 5 } }), 'MONEY_INVALID_RATE');
  code(() => M.convert(usd(1), 'XXX', rates), 'MONEY_INVALID_CURRENCY');
  assert.equal(M.convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  code(() => M.convertSum([], 'VND', rates), 'MONEY_INVALID_AMOUNT');
  code(() => M.convertSum('x', 'VND', rates), 'MONEY_INVALID_AMOUNT');
});
