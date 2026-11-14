import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, parseMoney, formatMoney, add, subtract, compare,
  divideRoundHalfEven, multiply, allocate, convert, convertSum,
} from '../src/money/index.js';

const usd = (minor) => ({ minor, currency: 'USD' });
const eur = (minor) => ({ minor, currency: 'EUR' });
const vnd = (minor) => ({ minor, currency: 'VND' });
const code = (c) => (e) => e && e.code === c;
const minors = (arr) => arr.map((p) => p.minor);
const RATES = {
  USD: { VND: '25000.5', EUR: '0.92' },
  EUR: { USD: '1.087', VND: '27000' },
  VND: { USD: '0.00004' },
};

// ---------- SPEC 66-68: money() ----------
test('money: tạo đối tượng mới, -0 thành +0 (SPEC 21, 68)', () => {
  assert.deepEqual(money(1050, 'USD'), usd(1050));
  const z = money(-0, 'USD');
  assert.ok(Object.is(z.minor, 0));
});
test('money: kiểm currency trước minor (SPEC 68)', () => {
  assert.throws(() => money(1.5, 'GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1, 5), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => money(1.5, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(2 ** 53, 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money('5', 'USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => money(NaN, 'USD'), code('MONEY_INVALID_AMOUNT'));
});

// ---------- SPEC 72: thứ tự lỗi parseMoney ----------
test('parseMoney thứ tự 1: locale trước currency', () => {
  assert.throws(() => parseMoney('5', { locale: 'xx', currency: 'GBP' }), code('MONEY_INVALID_LOCALE'));
});
test('parseMoney thứ tự 1: locale trước text không phải chuỗi', () => {
  assert.throws(() => parseMoney(5, { locale: 'de-DE' }), code('MONEY_INVALID_LOCALE'));
});
test('parseMoney thứ tự 2: currency trước text không phải chuỗi', () => {
  assert.throws(() => parseMoney(5, { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
});
test('parseMoney thứ tự 2: currency trước cú pháp', () => {
  assert.throws(() => parseMoney('abc', { currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
});
test('parseMoney thứ tự 3: text không phải chuỗi', () => {
  assert.throws(() => parseMoney(5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney(null), code('MONEY_INVALID_AMOUNT'));
});
test('parseMoney thứ tự 4: cú pháp trước loại tiền (GBP + số sai)', () => {
  assert.throws(() => parseMoney('GBP 1.', { currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('£5'), code('MONEY_INVALID_AMOUNT'));
});
test('parseMoney thứ tự 5: GBP hợp lệ cú pháp → INVALID_CURRENCY, kể cả có options.currency', () => {
  assert.throws(() => parseMoney('5 GBP'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('GBP 5', { currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
});
test('parseMoney thứ tự 5: không có loại tiền → INVALID_CURRENCY; khác nhau → MISMATCH', () => {
  assert.throws(() => parseMoney('5.00'), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => parseMoney('$5', { currency: 'EUR' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.throws(() => parseMoney('5 usd', { currency: 'VND' }), code('MONEY_CURRENCY_MISMATCH'));
  assert.deepEqual(parseMoney('$5', { currency: 'USD' }), usd(500));
  assert.deepEqual(parseMoney('5', { currency: 'EUR' }), eur(500));
});
test('parseMoney thứ tự 6/7: số quá lớn → INVALID_AMOUNT', () => {
  assert.throws(() => parseMoney('90,071,992,547,409.92 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('9007199254740991 VND'), vnd(9007199254740991));
  assert.throws(() => parseMoney('9007199254740992 VND'), code('MONEY_INVALID_AMOUNT'));
});

// ---------- SPEC 74-82: cú pháp parseMoney ----------
test('parseMoney: các ví dụ trong SPEC (82)', () => {
  assert.deepEqual(parseMoney('$1,234.56'), usd(123456));
  assert.deepEqual(parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), vnd(1234567));
  assert.deepEqual(parseMoney('1 234,56 €', { locale: 'fr-FR' }), eur(123456));
  assert.deepEqual(parseMoney('($5.00)'), usd(-500));
  assert.deepEqual(parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), usd(123));
});
test('parseMoney: khoảng trắng đầu/cuối và mã không phân biệt hoa thường (74, 76)', () => {
  assert.deepEqual(parseMoney('  usd 5.00  '), usd(500));
  assert.deepEqual(parseMoney('5 Eur'), eur(500));
  assert.deepEqual(parseMoney('5000₫'), vnd(5000));
});
test('parseMoney: token hai vị trí bất kể locale (76)', () => {
  assert.deepEqual(parseMoney('5.00$'), usd(500));
  assert.deepEqual(parseMoney('5,00 $', { locale: 'vi-VN' }), usd(500));
  assert.deepEqual(parseMoney('$5,00', { locale: 'fr-FR' }), usd(500));
});
test('parseMoney: token hai phía → INVALID_AMOUNT (76)', () => {
  assert.throws(() => parseMoney('$5 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('$5$'), code('MONEY_INVALID_AMOUNT'));
});
test('parseMoney: dấu âm/dương ở đầu (75)', () => {
  assert.deepEqual(parseMoney('-$5.00'), usd(-500));
  assert.deepEqual(parseMoney('- $5'), usd(-500));
  assert.deepEqual(parseMoney('+$5'), usd(500));
  assert.deepEqual(parseMoney('-5 USD'), usd(-500));
  assert.deepEqual(parseMoney('( $5.00 )'), usd(-500));
  assert.deepEqual(parseMoney('(5.00 USD)'), usd(-500));
  const z = parseMoney('-0', { currency: 'USD' });
  assert.ok(Object.is(z.minor, 0));
});
test('parseMoney: dấu sai chỗ hoặc trong ngoặc → INVALID_AMOUNT (75)', () => {
  for (const s of ['$-5', '5-', '5 USD-', '(-$5)', '(+5 USD)', '-(5 USD)', '($5', '$5)', '--5 USD', '()']) {
    assert.throws(() => parseMoney(s), code('MONEY_INVALID_AMOUNT'), s);
  }
});
test('parseMoney: phần số sai cú pháp (77)', () => {
  for (const s of ['.5 USD', '5. USD', '1e3 USD', '1,23 USD', '1,2345 USD', ',234 USD', '1,,234 USD', '1.2.3 USD', '', '   ', 'USD', '1 234 USD']) {
    assert.throws(() => parseMoney(s), code('MONEY_INVALID_AMOUNT'), s);
  }
  assert.throws(() => parseMoney(',5 EUR', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('5, EUR', { locale: 'fr-FR' }), code('MONEY_INVALID_AMOUNT'));
});
test('parseMoney: không trộn kiểu nhóm nghìn; nhóm đầu 1–3 chữ số (77)', () => {
  assert.throws(() => parseMoney('1234,567.00 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1,2345,678 USD'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('1234567 USD'), usd(123456700));
  assert.deepEqual(parseMoney('123,456 VND'), vnd(123456));
});
test('parseMoney: dấu cách chỉ cho phép ở fr-FR (77)', () => {
  assert.throws(() => parseMoney('1 234 USD', { locale: 'en-US' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => parseMoney('1 234 EUR', { locale: 'vi-VN' }), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('1 234 567 €', { locale: 'fr-FR' }), eur(123456700));
});
test('parseMoney: dấu phân cách đúng theo locale', () => {
  assert.throws(() => parseMoney('1.234,56 USD', { locale: 'en-US' }), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(parseMoney('1.234,56 $', { locale: 'vi-VN' }), usd(123456));
  assert.deepEqual(parseMoney('1,234,567.89 EUR'), eur(123456789));
});

// ---------- SPEC 79: làm tròn half-even trên chuỗi ----------
test('parseMoney: làm tròn half-even trên chuỗi thập phân (79)', () => {
  assert.deepEqual(parseMoney('1.005 USD'), usd(100));
  assert.deepEqual(parseMoney('1.015 USD'), usd(102));
  assert.deepEqual(parseMoney('1.0051 USD'), usd(101));
  assert.deepEqual(parseMoney('2.5 VND'), vnd(2));
  assert.deepEqual(parseMoney('3.5 VND'), vnd(4));
  assert.deepEqual(parseMoney('2.51 VND'), vnd(3));
  assert.deepEqual(parseMoney('0.4 VND'), vnd(0));
});
test('parseMoney: làm tròn trên giá trị tuyệt đối rồi áp dấu; không -0 (79)', () => {
  assert.deepEqual(parseMoney('-2.5 VND'), vnd(-2));
  assert.deepEqual(parseMoney('-3.5 VND'), vnd(-4));
  assert.deepEqual(parseMoney('(1.005 USD)'), usd(-100));
  const z = parseMoney('-0.4 VND');
  assert.ok(Object.is(z.minor, 0));
});
test('parseMoney: đủ chính xác với số rất dài', () => {
  assert.deepEqual(parseMoney('0.0050000000000000000001 USD'), usd(1));
  assert.deepEqual(parseMoney('1.00 VND'), vnd(1));
  assert.deepEqual(parseMoney('5 USD'), usd(500));
  assert.deepEqual(parseMoney('5.1 USD'), usd(510));
});
test('parseMoney: options null/undefined dùng mặc định en-US', () => {
  assert.deepEqual(parseMoney('$1.00', undefined), usd(100));
  assert.deepEqual(parseMoney('$1.00', null), usd(100));
});

// ---------- SPEC 86: formatMoney ----------
test('formatMoney thứ tự: m (đối tượng → currency → minor) trước locale', () => {
  assert.throws(() => formatMoney(null, { locale: 'xx' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney('5', { locale: 'xx' }), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'GBP' }, { locale: 'xx' }), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => formatMoney({ minor: 1.5, currency: 'USD' }, { locale: 'xx' }), code('MONEY_INVALID_AMOUNT'));
});
test('formatMoney thứ tự: locale trước display/negative', () => {
  assert.throws(() => formatMoney(usd(1), { locale: 'xx', display: 'bad', negative: 'bad' }), code('MONEY_INVALID_LOCALE'));
});
test('formatMoney: display sai / negative sai → INVALID_OPTION', () => {
  assert.throws(() => formatMoney(usd(1), { display: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { negative: 'bad' }), code('MONEY_INVALID_OPTION'));
  assert.throws(() => formatMoney(usd(1), { display: 'bad', negative: 'sign' }), code('MONEY_INVALID_OPTION'));
});
test('formatMoney: symbol theo ba locale (88-89)', () => {
  assert.equal(formatMoney(usd(123456)), '$1,234.56');
  assert.equal(formatMoney(vnd(1234567)), '₫1,234,567');
  assert.equal(formatMoney(usd(123456), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(formatMoney(usd(123456), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(formatMoney(eur(500), { locale: 'fr-FR' }), '5,00 €');
  assert.equal(formatMoney(vnd(1234567), { locale: 'vi-VN' }), '1.234.567 ₫');
});
test('formatMoney: luôn đủ chữ số thập phân; VND không có (88)', () => {
  assert.equal(formatMoney(usd(500)), '$5.00');
  assert.equal(formatMoney(usd(5)), '$0.05');
  assert.equal(formatMoney(usd(0)), '$0.00');
  assert.equal(formatMoney(vnd(0)), '₫0');
  assert.equal(formatMoney(usd(100000000)), '$1,000,000.00');
  assert.equal(formatMoney(usd(99999), { locale: 'vi-VN' }), '999,99 $');
});
test('formatMoney: code và none (90-91)', () => {
  assert.equal(formatMoney(usd(500), { display: 'code' }), 'USD 5.00');
  assert.equal(formatMoney(usd(500), { display: 'code', locale: 'vi-VN' }), '5,00 USD');
  assert.equal(formatMoney(eur(123456), { display: 'code', locale: 'fr-FR' }), '1 234,56 EUR');
  assert.equal(formatMoney(usd(123456), { display: 'none' }), '1,234.56');
  assert.equal(formatMoney(vnd(1234567), { display: 'none', locale: 'vi-VN' }), '1.234.567');
});
test('formatMoney: số âm sign/parens (92)', () => {
  assert.equal(formatMoney(usd(-500)), '-$5.00');
  assert.equal(formatMoney(usd(-500), { display: 'code' }), '-USD 5.00');
  assert.equal(formatMoney(usd(-500), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(formatMoney(usd(-500), { negative: 'parens' }), '($5.00)');
  assert.equal(formatMoney(usd(-500), { negative: 'parens', locale: 'vi-VN' }), '(5,00 $)');
  assert.equal(formatMoney(usd(-500), { display: 'none' }), '-5.00');
  assert.equal(formatMoney(usd(-500), { display: 'none', negative: 'parens' }), '(5.00)');
});
test('formatMoney: số không âm không có dấu/ngoặc (92)', () => {
  assert.equal(formatMoney(usd(0), { negative: 'parens' }), '$0.00');
  assert.equal(formatMoney(usd(500), { negative: 'parens' }), '$5.00');
  assert.equal(formatMoney({ minor: -0, currency: 'USD' }), '$0.00');
});
test('formatMoney: round-trip với parseMoney (93)', () => {
  const values = [0, 1, 5, 99, 100, 123456, -1, -500, -123456789, 9007199254740991, -9007199254740991];
  for (const currency of ['VND', 'USD', 'EUR']) {
    for (const minor of values) {
      for (const locale of ['en-US', 'vi-VN', 'fr-FR']) {
        for (const display of ['symbol', 'code']) {
          for (const negative of ['sign', 'parens']) {
            const m = { minor, currency };
            const s = formatMoney(m, { locale, display, negative });
            assert.deepEqual(parseMoney(s, { locale }), m, `${s} ${locale}`);
          }
        }
      }
    }
  }
});

// ---------- SPEC 97: add/subtract/compare ----------
test('add/subtract/compare cơ bản, trả đối tượng mới (21, 97)', () => {
  const a = usd(100);
  const b = usd(250);
  assert.deepEqual(add(a, b), usd(350));
  assert.deepEqual(subtract(a, b), usd(-150));
  assert.equal(compare(a, b), -1);
  assert.equal(compare(b, a), 1);
  assert.equal(compare(a, usd(100)), 0);
  assert.notEqual(add(a, usd(0)), a);
  const z = subtract(a, usd(100));
  assert.ok(Object.is(z.minor, 0));
});
test('add/subtract/compare: kiểm a rồi b rồi mismatch (97)', () => {
  for (const fn of [add, subtract, compare]) {
    assert.throws(() => fn(usd(1), eur(1)), code('MONEY_CURRENCY_MISMATCH'));
    assert.throws(() => fn(null, eur(1)), code('MONEY_INVALID_AMOUNT'));
    assert.throws(() => fn({ minor: 1, currency: 'GBP' }, { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_CURRENCY'));
    assert.throws(() => fn({ minor: 1.5, currency: 'USD' }, { minor: 1, currency: 'GBP' }), code('MONEY_INVALID_AMOUNT'));
    assert.throws(() => fn(usd(1), { minor: 1, currency: 'GBP' }), code('MONEY_INVALID_CURRENCY'));
    assert.throws(() => fn(eur(1), { minor: 1.5, currency: 'USD' }), code('MONEY_INVALID_AMOUNT'));
  }
});
test('add/subtract: vượt số nguyên an toàn → INVALID_AMOUNT (97)', () => {
  const max = usd(Number.MAX_SAFE_INTEGER);
  assert.throws(() => add(max, usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => subtract(usd(-Number.MAX_SAFE_INTEGER), usd(1)), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(add(max, usd(-1)), usd(Number.MAX_SAFE_INTEGER - 1));
});

// ---------- SPEC 99-101: divideRoundHalfEven ----------
test('divideRoundHalfEven: các ví dụ SPEC (101)', () => {
  assert.equal(divideRoundHalfEven(5, 2), 2);
  assert.equal(divideRoundHalfEven(7, 2), 4);
  assert.equal(divideRoundHalfEven(-5, 2), -2);
  assert.equal(divideRoundHalfEven(-7, 2), -4);
  assert.equal(divideRoundHalfEven(10, 4), 2);
  assert.equal(divideRoundHalfEven(14, 4), 4);
  assert.equal(divideRoundHalfEven(2, 3), 1);
  assert.equal(divideRoundHalfEven(5, -2), -2);
  assert.equal(divideRoundHalfEven(-5, -2), 2);
  assert.equal(divideRoundHalfEven(1, 3), 0);
});
test('divideRoundHalfEven: không -0 (101)', () => {
  assert.ok(Object.is(divideRoundHalfEven(-1, 3), 0));
  assert.ok(Object.is(divideRoundHalfEven(0, -5), 0));
  assert.ok(Object.is(divideRoundHalfEven(1, -3), 0));
});
test('divideRoundHalfEven: chính xác với n rất lớn (101)', () => {
  const M = Number.MAX_SAFE_INTEGER; // 9007199254740991 lẻ
  assert.equal(divideRoundHalfEven(M, 2), 4503599627370496); // .5 → chẵn
  assert.equal(divideRoundHalfEven(M - 1, 2), 4503599627370495);
  assert.equal(divideRoundHalfEven(-M, 2), -4503599627370496);
  assert.equal(divideRoundHalfEven(M, 1), M);
  assert.equal(divideRoundHalfEven(M, M), 1);
  assert.equal(divideRoundHalfEven(M, 3), 3002399751580330); // chia hết
  assert.equal(divideRoundHalfEven(M, 10), 900719925474099);
});
test('divideRoundHalfEven: lỗi (57, 64)', () => {
  assert.throws(() => divideRoundHalfEven(5, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(0, 0), code('MONEY_DIVIDE_BY_ZERO'));
  assert.throws(() => divideRoundHalfEven(1.5, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(5, 2.5), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven('5', 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(2 ** 53, 2), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => divideRoundHalfEven(1.5, 0), code('MONEY_INVALID_AMOUNT'));
});

// ---------- SPEC 103-105: multiply ----------
test('multiply: ví dụ SPEC (105)', () => {
  assert.deepEqual(multiply(usd(1005), '0.08'), usd(80));
  assert.deepEqual(multiply(usd(250), '0.01'), usd(2));
  assert.deepEqual(multiply(usd(350), '0.01'), usd(4));
  assert.deepEqual(multiply(usd(1005), '1.1'), usd(1106));
});
test('multiply: số âm đối xứng, hệ số âm, kết quả 0 là +0 (22, 105)', () => {
  assert.deepEqual(multiply(usd(-250), '0.01'), usd(-2));
  assert.deepEqual(multiply(usd(-350), '0.01'), usd(-4));
  assert.deepEqual(multiply(usd(250), '-0.01'), usd(-2));
  assert.deepEqual(multiply(usd(100), '-2'), usd(-200));
  assert.ok(Object.is(multiply(usd(-1), '0.1').minor, 0));
  assert.ok(Object.is(multiply(usd(5), '-0').minor, 0));
  assert.deepEqual(multiply(vnd(5), '0.5'), vnd(2));
  assert.deepEqual(multiply(vnd(7), '0.5'), vnd(4));
});
test('multiply: factor sai → INVALID_RATE (105)', () => {
  for (const f of [1.5, 2, '1e2', '.5', '5.', '', ' 1', '1 ', '+1', '--1', null, undefined, '1,5']) {
    assert.throws(() => multiply(usd(100), f), code('MONEY_INVALID_RATE'), String(f));
  }
});
test('multiply: m kiểm trước factor; vượt an toàn → INVALID_AMOUNT', () => {
  assert.throws(() => multiply(null, 'x'), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => multiply(usd(Number.MAX_SAFE_INTEGER), '2'), code('MONEY_INVALID_AMOUNT'));
  assert.deepEqual(multiply(usd(Number.MAX_SAFE_INTEGER), '1.0000000000000000000'), usd(Number.MAX_SAFE_INTEGER));
});

// ---------- SPEC 107-117: allocate ----------
test('allocate: ví dụ SPEC (117)', () => {
  assert.deepEqual(minors(allocate(usd(10), [1, 3])), [2, 8]);
  assert.deepEqual(minors(allocate(usd(100), [1, 2, 3])), [16, 33, 51]);
  assert.deepEqual(minors(allocate(usd(5), [3, 3, 1])), [3, 2, 0]);
  assert.deepEqual(minors(allocate(usd(1000), [1, 1, 1])), [334, 333, 333]);
  assert.deepEqual(minors(allocate(usd(7), [0, 1, 0, 1])), [0, 4, 0, 3]);
  assert.deepEqual(minors(allocate(usd(-10), [1, 3])), [-2, -8]);
});
test('allocate: phát dư theo tỉ lệ lớn nhất, không theo phần dư thập phân (111-114, 133)', () => {
  // 10×1/4=2.5, 10×3/4=7.5 → dư 1 cho tỉ lệ 3, không phải [3,7]
  assert.deepEqual(minors(allocate(usd(10), [1, 3])), [2, 8]);
  // [1,1,3]: A=7 → 1,1,4 (dư 0)... dùng A=8: 1,1,4 base → dư 2 cho tỉ lệ 3 trước, rồi chỉ số 0
  assert.deepEqual(minors(allocate(usd(8), [1, 1, 3])), [2, 1, 5]);
});
test('allocate: bằng nhau thì chỉ số nhỏ trước (114)', () => {
  assert.deepEqual(minors(allocate(usd(2), [1, 1, 1])), [1, 1, 0]);
  assert.deepEqual(minors(allocate(usd(5), [2, 5, 5])), [0, 3, 2]);
  assert.deepEqual(minors(allocate(usd(1), [1, 2, 2])), [0, 1, 0]);
});
test('allocate: ratio 0 luôn nhận 0, kể cả đứng trước (113-114)', () => {
  assert.deepEqual(minors(allocate(usd(3), [0, 1, 1])), [0, 2, 1]);
  assert.deepEqual(minors(allocate(usd(9), [0, 0, 5])), [0, 0, 9]);
  for (const p of allocate(usd(-3), [0, 1])) assert.ok(Object.is(p.minor, p.minor === 0 ? 0 : p.minor));
  assert.ok(Object.is(allocate(usd(-3), [0, 1])[0].minor, 0));
});
test('allocate: tổng đúng bằng m.minor và cùng loại tiền (109)', () => {
  for (const total of [0, 1, 7, 100, 999, 123457, -1, -7, -100001]) {
    for (const ratios of [[1], [1, 1], [1, 2, 3], [0, 3, 0, 7], [5, 5, 5, 5, 5, 5, 5], [1, 0, 0, 1]]) {
      const parts = allocate(eur(total), ratios);
      assert.equal(parts.length, ratios.length);
      assert.equal(parts.reduce((s, p) => s + p.minor, 0), total);
      for (const p of parts) assert.equal(p.currency, 'EUR');
    }
  }
});
test('allocate: số âm đối xứng số dương (115)', () => {
  assert.deepEqual(minors(allocate(usd(-1000), [1, 1, 1])), [-334, -333, -333]);
  assert.deepEqual(minors(allocate(usd(-5), [3, 3, 1])), [-3, -2, 0]);
  assert.ok(Object.is(allocate(usd(-5), [3, 3, 1])[2].minor, 0));
});
test('allocate: m = 0 cho toàn 0 (+0)', () => {
  const parts = allocate(usd(0), [1, 2]);
  assert.ok(parts.every((p) => Object.is(p.minor, 0)));
});
test('allocate: không tràn với số lớn (dùng BigInt)', () => {
  const M = Number.MAX_SAFE_INTEGER;
  const parts = allocate(vnd(M), [M, M]);
  assert.equal(parts[0].minor + parts[1].minor, M);
  assert.deepEqual(minors(parts), [4503599627370496, 4503599627370495]);
});
test('allocate: ratios sai → INVALID_RATIO (109)', () => {
  const bad = [[], [0], [0, 0], [-1, 2], [1.5, 2], ['1', 2], [1, NaN], [Infinity], [2 ** 53], null, undefined, 5, 'ab', {}];
  for (const r of bad) assert.throws(() => allocate(usd(10), r), code('MONEY_INVALID_RATIO'), JSON.stringify(r));
  // tổng vượt an toàn vẫn hợp lệ nếu từng phần tử an toàn
  assert.equal(allocate(usd(10), [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]).length, 2);
});
test('allocate: m sai kiểm trước ratios', () => {
  assert.throws(() => allocate(null, []), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => allocate({ minor: 1, currency: 'GBP' }, []), code('MONEY_INVALID_CURRENCY'));
});

// ---------- SPEC 119-125: convert ----------
test('convert: ví dụ SPEC (125)', () => {
  assert.deepEqual(convert(usd(100), 'VND', RATES), vnd(25000));
  assert.deepEqual(convert(usd(300), 'VND', RATES), vnd(75002));
  assert.deepEqual(convert(usd(1), 'VND', RATES), vnd(250));
  assert.deepEqual(convert(usd(1000), 'EUR', RATES), eur(920));
  assert.deepEqual(convert(usd(5), 'EUR', RATES), eur(5));
  assert.deepEqual(convert(vnd(1000000), 'USD', RATES), usd(4000));
  assert.deepEqual(convert(vnd(1), 'USD', RATES), usd(0));
  assert.deepEqual(convert(usd(-300), 'VND', RATES), vnd(-75002));
});
test('convert: tỉ giá theo đơn vị chính, chia 100 khi USD→VND (122, 135)', () => {
  assert.deepEqual(convert(usd(100), 'VND', { USD: { VND: '25000' } }), vnd(25000));
  assert.deepEqual(convert(vnd(25000), 'USD', { VND: { USD: '0.00004' } }), usd(100));
  assert.deepEqual(convert(eur(100), 'USD', RATES), usd(109)); // 108,7 xu → 109
});
test('convert: half-even một lần ở cuối, đối xứng số âm (22, 124)', () => {
  assert.deepEqual(convert(usd(100), 'VND', { USD: { VND: '25000.5' } }), vnd(25000)); // .005 → xuống chẵn
  assert.deepEqual(convert(usd(-100), 'VND', { USD: { VND: '25000.5' } }), vnd(-25000));
  assert.deepEqual(convert(usd(100), 'VND', { USD: { VND: '25001.5' } }), vnd(25002));
  assert.deepEqual(convert(usd(100), 'EUR', { USD: { EUR: '0.125' } }), eur(12)); // 12,5 xu → 12
  assert.deepEqual(convert(usd(100), 'EUR', { USD: { EUR: '0.135' } }), eur(14)); // 13,5 xu → 14
  assert.ok(Object.is(convert(vnd(1), 'USD', RATES).minor, 0));
  assert.ok(Object.is(convert(vnd(-1), 'USD', RATES).minor, 0));
});
test('convert: cùng loại tiền trả bản sao, không đọc rates (121)', () => {
  const a = usd(500);
  const r = convert(a, 'USD', undefined);
  assert.deepEqual(r, a);
  assert.notEqual(r, a);
  assert.deepEqual(convert(a, 'USD', 'rác'), a);
  assert.deepEqual(convert(a, 'USD', { USD: { USD: '0' } }), a);
  assert.ok(Object.is(convert({ minor: -0, currency: 'USD' }, 'USD', {}).minor, 0));
});
test('convert: `to` kiểm trước (121)', () => {
  assert.throws(() => convert(usd(1), 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(usd(1), undefined, RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(null, 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convert(null, 'USD', RATES), code('MONEY_INVALID_AMOUNT'));
});
test('convert: thiếu cặp → MISSING_RATE, không nghịch đảo, không qua trung gian (123)', () => {
  assert.throws(() => convert(vnd(100), 'EUR', { EUR: { VND: '27000' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(100), 'EUR', { USD: { VND: '25000' }, VND: { EUR: '0.00003' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(100), 'EUR', {}), code('MONEY_MISSING_RATE'));
  assert.throws(() => convert(usd(100), 'EUR', { USD: {} }), code('MONEY_MISSING_RATE'));
});
test('convert: rates/tỉ giá không hợp lệ hoặc bằng 0 → INVALID_RATE (123)', () => {
  for (const rates of [null, undefined, 5, 'x', []]) {
    assert.throws(() => convert(usd(1), 'VND', rates), code('MONEY_INVALID_RATE'));
  }
  for (const rate of [25000, '0', '0.00', '-5', '1e3', '.5', '5.', '', ' 5', 'abc', null, 1.5]) {
    assert.throws(() => convert(usd(1), 'VND', { USD: { VND: rate } }), code('MONEY_INVALID_RATE'), String(rate));
  }
});
test('convert: kết quả vượt an toàn → INVALID_AMOUNT', () => {
  assert.throws(() => convert(usd(Number.MAX_SAFE_INTEGER), 'VND', { USD: { VND: '25000' } }), code('MONEY_INVALID_AMOUNT'));
});
test('convert: không làm tròn tỉ giá, giữ chính xác nhiều chữ số', () => {
  assert.deepEqual(convert(vnd(1000000000), 'USD', { VND: { USD: '0.0000400001' } }), usd(4000010));
  assert.deepEqual(convert(vnd(1000000000), 'USD', { VND: { USD: '0.00004000049' } }), usd(4000049));
  assert.deepEqual(convert(vnd(1000000000), 'USD', { VND: { USD: '0.0000400005' } }), usd(4000050));
  assert.deepEqual(convert(vnd(100000), 'USD', { VND: { USD: '0.0000400001' } }), usd(400));
  assert.deepEqual(convert(vnd(100000), 'USD', { VND: { USD: '0.00004' } }), usd(400));
  assert.deepEqual(convert(vnd(10000), 'EUR', { VND: { EUR: '0.0000375' } }), eur(38)); // 37,5 → 38
});

// ---------- SPEC 127-129: convertSum ----------
test('convertSum: đổi và làm tròn từng khoản riêng (129)', () => {
  assert.deepEqual(convertSum([usd(100), usd(100), usd(100)], 'VND', { USD: { VND: '25000.5' } }), vnd(75000));
  assert.deepEqual(convert(usd(300), 'VND', { USD: { VND: '25000.5' } }), vnd(75002));
});
test('convertSum: nhiều loại tiền, gồm cả loại cùng đích', () => {
  assert.deepEqual(convertSum([usd(100), eur(100), vnd(5)], 'VND', RATES), vnd(25000 + 27000 + 5));
  assert.deepEqual(convertSum([usd(-300), usd(300)], 'VND', RATES), vnd(0));
  assert.deepEqual(convertSum([usd(5)], 'USD', undefined), usd(5));
});
test('convertSum: list rỗng/không phải mảng → INVALID_AMOUNT (57, 129)', () => {
  assert.throws(() => convertSum([], 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum(null, 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
  assert.throws(() => convertSum(usd(1), 'VND', RATES), code('MONEY_INVALID_AMOUNT'));
});
test('convertSum: lỗi lan từ convert, tổng vượt an toàn', () => {
  assert.throws(() => convertSum([usd(1), vnd(1)], 'EUR', { USD: { EUR: '1' } }), code('MONEY_MISSING_RATE'));
  assert.throws(() => convertSum([usd(1)], 'GBP', RATES), code('MONEY_INVALID_CURRENCY'));
  assert.throws(() => convertSum([vnd(Number.MAX_SAFE_INTEGER), vnd(1)], 'VND', {}), code('MONEY_INVALID_AMOUNT'));
  const r = convertSum([vnd(1), vnd(-1)], 'VND', {});
  assert.ok(Object.is(r.minor, 0));
});
