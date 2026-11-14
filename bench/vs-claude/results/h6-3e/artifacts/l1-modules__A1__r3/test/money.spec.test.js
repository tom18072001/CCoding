import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';

const code = (c) => (e) => e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });

test('money: kiểm tra và -0', () => {
  assert.deepEqual(M.money(-0, 'USD'), { minor: 0, currency: 'USD' });
  assert.ok(Object.is(M.money(-0, 'USD').minor, 0));
  assert.throws(() => M.money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => M.money(1, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => M.money(1.5, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => M.money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: ví dụ trong đặc tả', () => {
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(M.parseMoney('($5.00)'), { minor: -500, currency: 'USD' });
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), { minor: 123, currency: 'USD' });
  assert.deepEqual(M.parseMoney('- $5'), { minor: -500, currency: 'USD' });
  assert.deepEqual(M.parseMoney('5.00$'), { minor: 500, currency: 'USD' });
  assert.deepEqual(M.parseMoney('usd 5'), { minor: 500, currency: 'USD' });
  assert.deepEqual(M.parseMoney('-0', { currency: 'VND' }), { minor: 0, currency: 'VND' });
  assert.ok(Object.is(M.parseMoney('-0', { currency: 'VND' }).minor, 0));
});

test('parseMoney: làm tròn half-even trên chuỗi', () => {
  const p = (s, c = 'USD') => M.parseMoney(s, { currency: c }).minor;
  assert.equal(p('1.005'), 100);
  assert.equal(p('1.015'), 102);
  assert.equal(p('1.0051'), 101);
  assert.equal(p('2.5', 'VND'), 2);
  assert.equal(p('3.5', 'VND'), 4);
  assert.equal(p('-2.5', 'VND'), -2);
  assert.equal(p('-3.5', 'VND'), -4);
});

test('parseMoney: lỗi và thứ tự', () => {
  const bad = (t, o, c) => assert.throws(() => M.parseMoney(t, o), code(c), String(t));
  bad('$5', { locale: 'xx' }, 'MONEY_INVALID_LOCALE');
  bad('$5', { currency: 'GBP' }, 'MONEY_INVALID_CURRENCY');
  bad(5, { locale: 'xx' }, 'MONEY_INVALID_LOCALE');
  bad(5, {}, 'MONEY_INVALID_AMOUNT');
  bad('$-5', {}, 'MONEY_INVALID_AMOUNT');
  bad('5-', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('(-5)', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('$5$', {}, 'MONEY_INVALID_AMOUNT');
  bad('$ 5 USD', {}, 'MONEY_INVALID_AMOUNT');
  bad('GBP 5', {}, 'MONEY_INVALID_CURRENCY');
  bad('GBP x', {}, 'MONEY_INVALID_AMOUNT');
  bad('£5', {}, 'MONEY_INVALID_AMOUNT');
  bad('5', {}, 'MONEY_INVALID_CURRENCY');
  bad('$5', { currency: 'EUR' }, 'MONEY_CURRENCY_MISMATCH');
  bad('.5', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('5.', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1e3', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,23,456', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1,234.5.6', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('1 234', { currency: 'USD' }, 'MONEY_INVALID_AMOUNT');
  bad('9007199254740992', { currency: 'VND' }, 'MONEY_INVALID_AMOUNT');
  bad('', { currency: 'VND' }, 'MONEY_INVALID_AMOUNT');
});

test('formatMoney', () => {
  assert.equal(M.formatMoney(usd(500)), '$5.00');
  assert.equal(M.formatMoney(usd(-500)), '-$5.00');
  assert.equal(M.formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(M.formatMoney(usd(-500), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  assert.equal(M.formatMoney(usd(500), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(M.formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(M.formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(M.formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
  assert.throws(() => M.formatMoney(usd(1), { locale: 'xx' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => M.formatMoney(usd(1), { display: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => M.formatMoney(usd(1), { negative: 'x' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => M.formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => M.formatMoney({ minor: 1, currency: 'X' }, { locale: 'xx' }), code('MONEY_INVALID_CURRENCY'));
});

test('formatMoney/parseMoney khứ hồi', () => {
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of [0, 1, 5, 99, 100, 123456, -1, -100000, 1234567890123, -Number.MAX_SAFE_INTEGER]) {
      for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
        for (const display of ['symbol', 'code']) {
          const m = { minor, currency };
          assert.deepEqual(M.parseMoney(M.formatMoney(m, { locale, display }), { locale }), m);
        }
      }
    }
  }
});

test('add, subtract, compare', () => {
  assert.deepEqual(M.add(usd(1), usd(2)), usd(3));
  assert.deepEqual(M.subtract(usd(1), usd(1)), usd(0));
  assert.ok(Object.is(M.subtract(usd(1), usd(1)).minor, 0));
  assert.equal(M.compare(usd(1), usd(2)), -1);
  assert.equal(M.compare(usd(2), usd(2)), 0);
  assert.equal(M.compare(usd(3), usd(2)), 1);
  assert.throws(() => M.add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => M.compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => M.add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => M.add(null, usd(1)), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const d = M.divideRoundHalfEven;
  assert.equal(d(5, 2), 2);
  assert.equal(d(7, 2), 4);
  assert.equal(d(-5, 2), -2);
  assert.equal(d(10, 4), 2);
  assert.equal(d(14, 4), 4);
  assert.equal(d(2, 3), 1);
  assert.equal(d(5, -2), -2);
  assert.ok(Object.is(d(-1, 3), 0));
  assert.equal(d(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(d(Number.MAX_SAFE_INTEGER - 1, 2), 4503599627370495);
  assert.throws(() => d(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => d(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => d('1', 2), code('MONEY_INVALID_AMOUNT'));
});

test('multiply', () => {
  assert.equal(M.multiply(usd(1005), '0.08').minor, 80);
  assert.equal(M.multiply(usd(250), '0.01').minor, 2);
  assert.equal(M.multiply(usd(350), '0.01').minor, 4);
  assert.equal(M.multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(M.multiply(usd(100), '-1.5').minor, -150);
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1', ' 1']) {
    assert.throws(() => M.multiply(usd(1), f), code('MONEY_INVALID_RATE'));
  }
});

test('allocate', () => {
  const a = (n, r) => M.allocate(usd(n), r).map((x) => x.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.ok(Object.is(a(-1, [0, 1, 1])[0], 0));
  assert.ok(Object.is(a(-1, [1, 1])[1], 0));
  assert.equal(M.allocate({ minor: 3, currency: 'VND' }, [1, 1])[0].currency, 'VND');
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'x', [1, '2']]) {
    assert.throws(() => M.allocate(usd(1), r), code('MONEY_INVALID_RATIO'));
  }
});

const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
test('convert', () => {
  const c = (m, to) => M.convert(m, to, rates).minor;
  assert.equal(c(usd(100), 'VND'), 25000);
  assert.equal(c(usd(300), 'VND'), 75002);
  assert.equal(c(usd(1), 'VND'), 250);
  assert.equal(c(usd(1000), 'EUR'), 920);
  assert.equal(c(usd(5), 'EUR'), 5);
  assert.equal(c({ minor: 1000000, currency: 'VND' }, 'USD'), 4000);
  assert.equal(c({ minor: 1, currency: 'VND' }, 'USD'), 0);
  assert.equal(c(usd(-300), 'VND'), -75002);
  // cùng loại: không đọc rates
  assert.deepEqual(M.convert(usd(5), 'USD', null), usd(5));
  // không nghịch đảo
  assert.throws(() => M.convert({ minor: 1, currency: 'VND' }, 'EUR', rates), code('MONEY_MISSING_RATE'));
  assert.throws(() => M.convert(usd(1), 'VND', { EUR: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => M.convert(usd(1), 'VND', null), code('MONEY_INVALID_RATE'));
  for (const r of ['0', '0.0', 25000, '-1', '1e3', '.5']) {
    assert.throws(() => M.convert(usd(1), 'VND', { USD: { VND: r } }), code('MONEY_INVALID_RATE'));
  }
  assert.throws(() => M.convert(usd(1), 'GBP', rates), code('MONEY_INVALID_CURRENCY'));
});

test('convertSum', () => {
  assert.equal(M.convertSum([usd(100), usd(100), usd(100)], 'VND', rates).minor, 75000);
  assert.deepEqual(M.convertSum([usd(100), { minor: 5, currency: 'VND' }], 'VND', rates), { minor: 25005, currency: 'VND' });
  assert.throws(() => M.convertSum([], 'VND', rates), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => M.convertSum('x', 'VND', rates), code('MONEY_INVALID_AMOUNT'));
});
