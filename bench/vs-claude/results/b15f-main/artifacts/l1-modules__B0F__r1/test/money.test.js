import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare, divideRoundHalfEven,
  multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

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

const code = (c) => (e) => e && e.code === c;
const usd = (minor) => ({ minor, currency: 'USD' });
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

test('money: tạo, -0 thành +0, thứ tự kiểm currency rồi minor', () => {
  const m = money(-0, 'USD');
  assert.ok(Object.is(m.minor, 0));
  assert.deepEqual(m, usd(0));
  assert.throws(() => money(1.5, 'XXX'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('1', 'USD'), code('MONEY_INVALID_AMOUNT'));
});

test('parseMoney: half-even trên chuỗi thập phân', () => {
  assert.equal(parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  assert.equal(parseMoney('-3.5', { currency: 'VND' }).minor, -4);
  assert.ok(Object.is(parseMoney('-0.001 USD').minor, 0));
});

test('parseMoney: ví dụ trong SPEC và locale', () => {
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), { minor: 1234567, currency: 'VND' });
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), { minor: 123456, currency: 'EUR' });
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('usd 5'), usd(500));
  assert.deepEqual(parseMoney(' 1234567.5 USD '), usd(123456750));
  assert.deepEqual(parseMoney('5', { currency: 'EUR' }), { minor: 500, currency: 'EUR' });
});

test('parseMoney: cú pháp sai → MONEY_INVALID_AMOUNT', () => {
  for (const t of ['$-5', '5-', '.5', '5.', '1e3', '£5', '$5$', '$5 USD', '', '$', '(-$5)', '(+5 USD)',
    '1,23,456 USD', '12,34 USD', '1,2345 USD', '1 234 USD', '$1,234.5,6', '1234,567.00 USD']) {
    assert.throws(() => parseMoney(t), code('MONEY_INVALID_AMOUNT'), t);
  }
  assert.throws(() => parseMoney('5,', { locale: 'vi-VN', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney(',5', { locale: 'fr-FR', currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('9007199254740992 VND'), code('MONEY_INVALID_AMOUNT'));
  assert.equal(parseMoney('9007199254740991 VND').minor, 9007199254740991);
});

test('parseMoney: thứ tự kiểm lỗi (1)-(6)', () => {
  assert.throws(() => parseMoney(5, { locale: 'xx', currency: 'ZZZ' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => parseMoney(5, { currency: 'ZZZ' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney(null, { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('GBP 5.'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('GBP 5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('5 USD', { currency: 'VND' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5', { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
});

test('formatMoney: locale, display, negative', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney({ minor: 1234567, currency: 'VND' }), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(usd(500), { display: 'none' }), '5.00');
  assert.equal(formatMoney(usd(5), { display: 'none' }), '0.05');
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney({ minor: 5, currency: 'EUR' }, { locale: 'fr-FR' }), '0,05 €');
});

test('formatMoney: thứ tự lỗi m → locale → option', () => {
  assert.throws(() => formatMoney(null), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'XXX' }, { locale: 'x' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'x' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney(usd(1), { locale: 'x', display: 'bad' }), code('MONEY_INVALID_LOCALE'));
  assert.throws(() => formatMoney(usd(1), { display: 'bad', negative: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
});

test('parse(format(m)) khứ hồi với mọi locale', () => {
  const samples = [usd(0), usd(5), usd(-5), usd(123456789), { minor: -1234567, currency: 'VND' }, { minor: 99, currency: 'EUR' }];
  for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
    for (const display of ['symbol', 'code']) {
      for (const negative of ['sign', 'parens']) {
        for (const m of samples) {
          assert.deepEqual(parseMoney(formatMoney(m, { locale, display, negative }), { locale }), m);
        }
      }
    }
  }
});

test('add / subtract / compare', () => {
  assert.deepEqual(add(usd(100), usd(250)), usd(350));
  assert.deepEqual(subtract(usd(100), usd(250)), usd(-150));
  assert.ok(Object.is(subtract(usd(100), usd(100)).minor, 0));
  assert.equal(compare(usd(1), usd(2)), -1);
  assert.equal(compare(usd(2), usd(2)), 0);
  assert.equal(compare(usd(3), usd(2)), 1);
  const x = usd(1);
  assert.notEqual(add(x, usd(0)), x);
  assert.throws(() => add(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => subtract(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => compare(usd(1), { minor: 1, currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(null, { minor: 1, currency: 'XXX' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(usd(1), { minor: 1, currency: 'XXX' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => add({ minor: 1.5, currency: 'USD' }, { minor: 1, currency: 'XXX' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => add(usd(1), { minor: 1.5, currency: 'EUR' }), code('MONEY_INVALID_AMOUNT'));
});

test('divideRoundHalfEven', () => {
  const cases = [[5, 2, 2], [7, 2, 4], [-5, 2, -2], [10, 4, 2], [14, 4, 4], [2, 3, 1], [5, -2, -2], [-7, -2, 4]];
  for (const [n, d, r] of cases) assert.equal(divideRoundHalfEven(n, d), r, `${n}/${d}`);
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(divideRoundHalfEven(Number.MAX_SAFE_INTEGER - 1, 3), 3002399751580330);
  assert.throws(() => divideRoundHalfEven(1, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1, '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1.5, 0), code('MONEY_INVALID_AMOUNT'));
});

test('multiply: ví dụ SPEC và lỗi', () => {
  assert.equal(multiply(usd(1005), '0.08').minor, 80);
  assert.equal(multiply(usd(250), '0.01').minor, 2);
  assert.equal(multiply(usd(350), '0.01').minor, 4);
  assert.equal(multiply(usd(1005), '1.1').minor, 1106);
  assert.equal(multiply(usd(-350), '0.01').minor, -4);
  assert.equal(multiply(usd(100), '-2').minor, -200);
  assert.ok(Object.is(multiply(usd(1), '0.1').minor, 0));
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1', ' 1', null]) {
    assert.throws(() => multiply(usd(1), f), code('MONEY_INVALID_RATE'), String(f));
  }
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply({ minor: 1, currency: 'XXX' }, 'x'), code('MONEY_INVALID_CURRENCY'));
});

test('allocate: ví dụ SPEC (phát dư theo tỉ lệ lớn nhất, không theo phần dư thập phân)', () => {
  const mins = (m, r) => allocate(m, r).map((p) => p.minor);
  assert.deepEqual(mins(usd(10), [1, 3]), [2, 8]);
  assert.deepEqual(mins(usd(100), [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(mins(usd(5), [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(mins(usd(1000), [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(mins(usd(7), [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(mins(usd(-10), [1, 3]), [-2, -8]);
  const zero = allocate(usd(-1), [0, 1]);
  assert.ok(Object.is(zero[0].minor, 0));
  assert.deepEqual(zero.map((p) => p.currency), ['USD', 'USD']);
  assert.deepEqual(mins({ minor: 0, currency: 'VND' }, [1, 1]), [0, 0]);
  const big = mins(usd(Number.MAX_SAFE_INTEGER), [Number.MAX_SAFE_INTEGER, 1]);
  assert.equal(big[0] + big[1], Number.MAX_SAFE_INTEGER);
});

test('allocate: MONEY_INVALID_RATIO', () => {
  for (const r of [[], 'a', null, [0, 0], [-1, 2], [1.5], ['1'], [NaN]]) {
    assert.throws(() => allocate(usd(10), r), code('MONEY_INVALID_RATIO'));
  }
  assert.throws(() => allocate(null, []), code('MONEY_INVALID_AMOUNT'));
});

test('convert: ví dụ SPEC, làm tròn một lần', () => {
  const c = (m, to) => convert(m, to, RATES);
  assert.deepEqual(c(usd(100), 'VND'), { minor: 25000, currency: 'VND' });
  assert.deepEqual(c(usd(300), 'VND'), { minor: 75002, currency: 'VND' });
  assert.deepEqual(c(usd(1), 'VND'), { minor: 250, currency: 'VND' });
  assert.deepEqual(c(usd(1000), 'EUR'), { minor: 920, currency: 'EUR' });
  assert.deepEqual(c(usd(5), 'EUR'), { minor: 5, currency: 'EUR' });
  assert.deepEqual(c({ minor: 1000000, currency: 'VND' }, 'USD'), usd(4000));
  assert.deepEqual(c({ minor: 1, currency: 'VND' }, 'USD'), usd(0));
  assert.deepEqual(c(usd(-300), 'VND'), { minor: -75002, currency: 'VND' });
});

test('convert: cùng loại tiền không đọc rates; lỗi và thứ tự', () => {
  const m = usd(5);
  const r = convert(m, 'USD', null);
  assert.deepEqual(r, m);
  assert.notEqual(r, m);
  assert.deepEqual(convert(m, 'USD', undefined), m);
  assert.throws(() => convert(m, 'XXX', null), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(m, 'EUR', null), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'EUR', 'x'), code('MONEY_INVALID_RATE'));
  assert.throws(() => convert(m, 'EUR', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(m, 'EUR', { USD: {} }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', RATES), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert({ minor: 1, currency: 'VND' }, 'EUR', { EUR: { VND: '27000' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(m, 'VND', { USD: { EUR: '1' }, EUR: { VND: '2' } }), code('MONEY_MISSING_RATE'));
  for (const bad of ['0', '0.0', 25000, '-1', '1e3', '.5', '1.', '', null, '1,5']) {
    assert.throws(() => convert(m, 'VND', { USD: { VND: bad } }), code('MONEY_INVALID_RATE'), String(bad));
  }
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '1000' } }), code('MONEY_INVALID_AMOUNT'));
});

test('convertSum: làm tròn từng khoản rồi cộng', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', RATES), { minor: 75000, currency: 'VND' });
  assert.deepEqual(convert(usd(300), 'VND', RATES), { minor: 75002, currency: 'VND' });
  const mixed = [usd(100), { minor: 1, currency: 'EUR' }, { minor: 7, currency: 'VND' }];
  assert.deepEqual(convertSum(mixed, 'VND', RATES), { minor: 25000 + 270 + 7, currency: 'VND' });
  assert.deepEqual(convertSum([usd(5)], 'USD', null), usd(5));
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum('x', 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum([usd(1)], 'VND', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convertSum([usd(1)], 'XXX', RATES), code('MONEY_INVALID_CURRENCY'));
});
