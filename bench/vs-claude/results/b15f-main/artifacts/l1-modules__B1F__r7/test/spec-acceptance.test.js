// Nghiệm thu S6: đối chiếu các ví dụ và quy tắc trong SPEC.md qua API công khai.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/money/index.js';
import * as C from '../src/calendar/index.js';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';
import * as S from '../src/slug/index.js';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_THROW'; };
const u = (m, c) => ({ minor: m, currency: c });

test('money: parseMoney ví dụ, thứ tự lỗi, làm tròn', () => {
  assert.deepEqual(M.parseMoney('$1,234.56'), u(123456, 'USD'));
  assert.deepEqual(M.parseMoney('1.234.567 ₫', { locale: 'vi-VN' }), u(1234567, 'VND'));
  assert.deepEqual(M.parseMoney('1 234,56 €', { locale: 'fr-FR' }), u(123456, 'EUR'));
  assert.deepEqual(M.parseMoney('($5.00)'), u(-500, 'USD'));
  assert.deepEqual(M.parseMoney('- $5'), u(-500, 'USD'));
  assert.deepEqual(M.parseMoney('1,234', { locale: 'vi-VN', currency: 'USD' }), u(123, 'USD'));
  assert.deepEqual(M.parseMoney('5.00$'), u(500, 'USD'));
  assert.deepEqual(M.parseMoney('usd 5'), u(500, 'USD'));
  assert.equal(M.parseMoney('1.005', { currency: 'USD' }).minor, 100);
  assert.equal(M.parseMoney('1.015', { currency: 'USD' }).minor, 102);
  assert.equal(M.parseMoney('1.0051', { currency: 'USD' }).minor, 101);
  assert.equal(M.parseMoney('2.5', { currency: 'VND' }).minor, 2);
  assert.equal(M.parseMoney('3.5', { currency: 'VND' }).minor, 4);
  assert.equal(M.parseMoney('-2.5', { currency: 'VND' }).minor, -2);
  for (const bad of ['$-5', '5-', '.5', '5.', '1e3', '£5', '$5$', '(-5)', '$ 5 €', '1,23,456']) {
    assert.equal(code(() => M.parseMoney(bad, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT', bad);
  }
  assert.equal(code(() => M.parseMoney('5 GBP')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney('5')), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney('5 EUR', { currency: 'USD' })), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.parseMoney(5, { locale: 'xx' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => M.parseMoney(5, { currency: 'XXX' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(code(() => M.parseMoney(5, { currency: 'USD' })), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.parseMoney('9007199254740992', { currency: 'VND' })), 'MONEY_INVALID_AMOUNT');
});

test('money: formatMoney, round-trip, lỗi', () => {
  assert.equal(M.formatMoney(u(500, 'USD')), '$5.00');
  assert.equal(M.formatMoney(u(1234567, 'VND')), '₫1,234,567');
  assert.equal(M.formatMoney(u(123456, 'USD'), { locale: 'vi-VN' }), '1.234,56 $');
  assert.equal(M.formatMoney(u(123456, 'USD'), { locale: 'fr-FR' }), '1 234,56 $');
  assert.equal(M.formatMoney(u(500, 'USD'), { display: 'code' }), 'USD 5.00');
  assert.equal(M.formatMoney(u(500, 'USD'), { locale: 'vi-VN', display: 'code' }), '5,00 USD');
  assert.equal(M.formatMoney(u(500, 'USD'), { display: 'none' }), '5.00');
  assert.equal(M.formatMoney(u(-500, 'USD')), '-$5.00');
  assert.equal(M.formatMoney(u(-500, 'USD'), { display: 'code' }), '-USD 5.00');
  assert.equal(M.formatMoney(u(-500, 'USD'), { locale: 'vi-VN' }), '-5,00 $');
  assert.equal(M.formatMoney(u(-500, 'USD'), { negative: 'parens' }), '($5.00)');
  assert.equal(M.formatMoney(u(-500, 'USD'), { locale: 'vi-VN', negative: 'parens' }), '(5,00 $)');
  for (const locale of ['en-US', 'vi-VN', 'fr-FR'])
    for (const display of ['symbol', 'code'])
      for (const m of [u(-123456789, 'EUR'), u(0, 'USD'), u(7, 'USD'), u(-1234567, 'VND')])
        assert.deepEqual(M.parseMoney(M.formatMoney(m, { locale, display }), { locale }), m);
  assert.equal(code(() => M.formatMoney(u(1, 'USD'), { locale: 'x' })), 'MONEY_INVALID_LOCALE');
  assert.equal(code(() => M.formatMoney(u(1, 'USD'), { display: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(u(1, 'USD'), { negative: 'x' })), 'MONEY_INVALID_OPTION');
  assert.equal(code(() => M.formatMoney(null)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.formatMoney({ minor: 1, currency: 'GBP' })), 'MONEY_INVALID_CURRENCY');
  assert.equal(Object.is(M.money(-0, 'USD').minor, 0), true);
  assert.equal(code(() => M.money(1.5, 'USD')), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.money(1, 5)), 'MONEY_INVALID_CURRENCY');
});

test('money: add/subtract/compare/divide/multiply', () => {
  assert.equal(code(() => M.add(u(1, 'USD'), u(1, 'EUR'))), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.compare(u(1, 'USD'), u(1, 'EUR'))), 'MONEY_CURRENCY_MISMATCH');
  assert.equal(code(() => M.add(u(Number.MAX_SAFE_INTEGER, 'USD'), u(1, 'USD'))), 'MONEY_INVALID_AMOUNT');
  assert.equal(Object.is(M.subtract(u(5, 'USD'), u(5, 'USD')).minor, 0), true);
  assert.equal(M.compare(u(1, 'USD'), u(2, 'USD')), -1);
  assert.equal(M.compare(u(2, 'USD'), u(2, 'USD')), 0);
  assert.equal(M.compare(u(3, 'USD'), u(2, 'USD')), 1);
  const d = M.divideRoundHalfEven;
  assert.deepEqual([d(5, 2), d(7, 2), d(-5, 2), d(10, 4), d(14, 4), d(2, 3), d(5, -2)], [2, 4, -2, 2, 4, 1, -2]);
  assert.equal(Object.is(d(-1, 3), 0), true);
  assert.equal(d(Number.MAX_SAFE_INTEGER, 2), 4503599627370496);
  assert.equal(code(() => d(1, 0)), 'MONEY_DIVIDE_BY_ZERO');
  assert.equal(code(() => d(1.5, 2)), 'MONEY_INVALID_AMOUNT');
  const mul = (x, f) => M.multiply(u(x, 'USD'), f).minor;
  assert.deepEqual([mul(1005, '0.08'), mul(250, '0.01'), mul(350, '0.01'), mul(1005, '1.1'), mul(-250, '0.01')], [80, 2, 4, 1106, -2]);
  for (const f of [1.5, '1e2', '.5', '5.', '', '+1'])
    assert.equal(code(() => M.multiply(u(1, 'USD'), f)), 'MONEY_INVALID_RATE', String(f));
});

test('money: allocate và convert theo ví dụ spec', () => {
  const a = (x, r) => M.allocate(u(x, 'USD'), r).map((v) => v.minor);
  assert.deepEqual(a(10, [1, 3]), [2, 8]);
  assert.deepEqual(a(100, [1, 2, 3]), [16, 33, 51]);
  assert.deepEqual(a(5, [3, 3, 1]), [3, 2, 0]);
  assert.deepEqual(a(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(a(7, [0, 1, 0, 1]), [0, 4, 0, 3]);
  assert.deepEqual(a(-10, [1, 3]), [-2, -8]);
  assert.equal(a(0, [1, 1]).every((x) => Object.is(x, 0)), true);
  assert.equal(a(-1, [1, 1]).some((x) => Object.is(x, -0)), false);
  for (const r of [[], [0, 0], [-1, 2], [1.5], 'x']) assert.equal(code(() => M.allocate(u(1, 'USD'), r)), 'MONEY_INVALID_RATIO');
  const rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } };
  const cv = (x, from, to) => M.convert(u(x, from), to, rates).minor;
  assert.deepEqual([cv(100, 'USD', 'VND'), cv(300, 'USD', 'VND'), cv(1, 'USD', 'VND'), cv(1000, 'USD', 'EUR'),
    cv(5, 'USD', 'EUR'), cv(1000000, 'VND', 'USD'), cv(1, 'VND', 'USD'), cv(-300, 'USD', 'VND')],
  [25000, 75002, 250, 920, 5, 4000, 0, -75002]);
  assert.equal(code(() => M.convert(u(1, 'VND'), 'EUR', rates)), 'MONEY_MISSING_RATE');
  assert.equal(code(() => M.convert(u(1, 'USD'), 'VND', { USD: { VND: '0' } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(u(1, 'USD'), 'VND', { USD: { VND: 25000 } })), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(u(1, 'USD'), 'VND', null)), 'MONEY_INVALID_RATE');
  assert.equal(code(() => M.convert(u(1, 'USD'), 'XXX', rates)), 'MONEY_INVALID_CURRENCY');
  assert.deepEqual(M.convert(u(5, 'USD'), 'USD', null), u(5, 'USD'));
  const list = [u(100, 'USD'), u(100, 'USD'), u(100, 'USD')];
  assert.deepEqual(M.convertSum(list, 'VND', rates), u(75000, 'VND'));
  assert.equal(code(() => M.convertSum([], 'VND', rates)), 'MONEY_INVALID_AMOUNT');
  assert.equal(code(() => M.convertSum('x', 'VND', rates)), 'MONEY_INVALID_AMOUNT');
});

test('calendar: nghỉ bù, addWorkingDays, workingDaysBetween, ISO week', () => {
  const comp = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11', '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(comp)) {
    assert.equal(C.compensationFor(h), c);
    assert.equal(C.dayInfo(c).type, 'compensation');
    assert.equal(C.dayInfo(h).type, 'holiday');
  }
  assert.equal(C.compensationFor('2025-01-01'), null);
  assert.equal(C.compensationFor('2025-01-04'), null);
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.equal(C.dayInfo('2025-02-02').type, 'weekend');
  assert.deepEqual(C.nonWorkingDays(2024), []);
  assert.equal(C.nonWorkingDays(2027).some((x) => x.date === '2027-05-03' && x.type === 'compensation'), true);
  assert.equal(C.nonWorkingDays(2025).every((x) => x.date.startsWith('2025')), true);
  const aw = C.addWorkingDays;
  assert.deepEqual([aw('2025-01-27', 1), aw('2025-01-27', 2), aw('2025-02-04', -2), aw('2026-04-24', 1), aw('2027-02-05', 1), aw('2025-02-02', 1), aw('2025-02-02', 0)],
    ['2025-01-28', '2025-02-04', '2025-01-27', '2026-04-28', '2027-02-15', '2025-02-04', '2025-02-02']);
  assert.equal(code(() => aw('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => aw('2025-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => aw('2025-1-1', 'x')), 'CAL_INVALID_DATE');
  assert.equal(code(() => C.addDays('2025-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => C.addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(C.isValidDate('1900-02-29'), false);
  assert.equal(C.isValidDate('2000-02-29'), true);
  assert.equal(C.isValidDate('2101-01-01'), false);
  assert.equal(C.isValidDate(null), false);
  assert.equal(C.rollForward('2026-04-25'), '2026-04-28');
  assert.equal(C.rollBackward('2026-04-27'), '2026-04-24');
  const w = (f, t, b) => C.workingDaysBetween(f, t, b === undefined ? undefined : { bounds: b });
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => w('2026-04-24', '2026-04-29', b)), [2, 2, 3, 1]);
  assert.equal(w('2026-04-29', '2026-04-24', 'start'), -2);
  assert.equal(w('2026-04-29', '2026-04-24', 'both'), -3);
  assert.equal(w('2026-04-24', '2026-04-29'), 2);
  assert.equal(w('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(w('2026-04-28', '2026-04-28', 'start'), 0);
  assert.equal(Object.is(w('2026-04-28', '2026-04-28', 'end'), 0), true);
  assert.equal(code(() => w('2026-04-28', '2026-04-29', 'x')), 'CAL_INVALID_OPTION');
  assert.equal(aw('2026-04-24', w('2026-04-24', '2026-04-29', 'end')), '2026-04-29');
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual([2020, 2026, 2015, 2021, 2024, 2025].map(C.isoWeeksInYear), [53, 53, 53, 52, 52, 52]);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(code(() => C.isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => C.isoWeekToDate(2025, 1, 8)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => C.isoWeekToDate(1899, 1)), 'CAL_INVALID_WEEK');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.diffDays('2025-01-05', '2025-01-01'), -4);
  let d = '1900-01-01';
  for (let i = 0; i < 400; i++, d = C.addDays(d, 37)) {
    const x = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(x.year, x.week, x.weekday), d);
  }
});

test('csvcheck: parse, ví dụ spec, thứ tự lỗi', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n  \n""\r"b\r\nc"'), [['a'], ['  '], [''], ['b\r\nc']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  const err = (f) => { try { f(); } catch (e) { return e; } };
  assert.equal(err(() => parseCsv('a\n"b')).code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(err(() => parseCsv('a\nab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(err(() => parseCsv('h\n\n"ab"c')).row, 2);
  assert.equal(err(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  for (const dl of ['"', '\n', '\r', ';;', '']) assert.equal(err(() => parseCsv('a', { delimiter: dl })).code, 'CSV_INVALID_INPUT');
  const schema = { columns: [{ name: 'id', type: 'int', required: true, unique: true, min: 1 }, { name: 'name', maxLength: 5 }] };
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false, rowCount: 4, errors: [
      { row: 3, column: 'id', code: 'UNIQUE' }, { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' }, { row: 5, column: 'id', code: 'REQUIRED' }] });
});

test('csvcheck: kiểu, ràng buộc, lỗi cấp tệp/lược đồ', () => {
  const v = (text, col, extra) => validateCsv('c\n' + text + '\n', { columns: [{ name: 'c', ...col }] }, extra).errors.map((e) => e.code);
  assert.deepEqual(['007', '+5', '-0'].map((x) => v(x, { type: 'int' })), [[], [], []]);
  assert.deepEqual(['1.0', '1e3', ' 1', '9007199254740992'].map((x) => v(x, { type: 'int' })), [['TYPE'], ['TYPE'], ['TYPE'], ['TYPE']]);
  assert.deepEqual(['5.', '.5', 'NaN', '1e3'].map((x) => v(x, { type: 'number' })), [['TYPE'], ['TYPE'], ['TYPE'], ['TYPE']]);
  assert.deepEqual(['1.5', '-2', '+3.25'].map((x) => v(x, { type: 'number' })), [[], [], []]);
  assert.deepEqual(['TRUE', 'false'].map((x) => v(x, { type: 'bool' })), [[], []]);
  assert.deepEqual(['1', 'yes'].map((x) => v(x, { type: 'bool' })), [['TYPE'], ['TYPE']]);
  assert.deepEqual(['2024-02-29', '2023-02-29', '2024-13-01', '0000-01-01'].map((x) => v(x, { type: 'date' })), [[], ['TYPE'], ['TYPE'], ['TYPE']]);
  assert.deepEqual(v('a', { enum: ['A'] }), ['ENUM']);
  assert.deepEqual(v('abc', { pattern: 'b' }), []);
  assert.deepEqual(v('abc', { pattern: '^b$' }), ['PATTERN']);
  assert.deepEqual(v('😀', { minLength: 2 }), ['MIN_LENGTH']);
  assert.deepEqual(v('😀', { maxLength: 1 }), []);
  assert.deepEqual(v('abc', { min: 5, max: 1 }), []);
  assert.deepEqual(v('5', { type: 'int', min: 5, max: 5 }), []);
  assert.deepEqual(v('4', { type: 'int', min: 5 }), ['MIN']);
  assert.deepEqual(v('6', { type: 'int', max: 5 }), ['MAX']);
  assert.deepEqual(v('2024-01-01', { type: 'date', min: '2024-01-02' }), ['MIN']);
  assert.deepEqual(v('x', { type: 'int', enum: ['y'], pattern: '^\\d$', maxLength: 0 }), ['TYPE']);
  assert.deepEqual(v('z', { enum: ['y'], pattern: '^\\d$', minLength: 5, maxLength: 0 }), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH']);
  assert.deepEqual(v('', { enum: ['y'], pattern: 'x', minLength: 3 }), []);
  const two = { columns: [{ name: 'a', unique: true }] };
  assert.deepEqual(validateCsv('a\n1\n01\n1\n', two).errors, [{ row: 4, column: 'a', code: 'UNIQUE' }]);
  assert.deepEqual(validateCsv('a\n\n\n', two), { ok: true, rowCount: 0, errors: [] });
  const rl = validateCsv('a,b\n1\n1,2,3\n1,x\n', { columns: [{ name: 'a', unique: true }, { name: 'b', type: 'int' }] });
  assert.deepEqual(rl.errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }, { row: 3, column: null, code: 'ROW_LENGTH' }, { row: 4, column: 'b', code: 'TYPE' }]);
  const sch = { columns: [{ name: 'z', required: true }, { name: 'a', type: 'int' }, { name: 'q', required: true }] };
  assert.deepEqual(validateCsv('a,z\nx,\n', sch).errors, [
    { row: 1, column: 'q', code: 'MISSING_COLUMN' }, { row: 2, column: 'z', code: 'REQUIRED' }, { row: 2, column: 'a', code: 'TYPE' }]);
  assert.deepEqual(validateCsv('A\n1\n', { columns: [{ name: 'a' }] }).errors, [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('a,a\nx,\n', { columns: [{ name: 'a', required: true }] }).errors, []);
  assert.deepEqual(validateCsv('', two), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.equal(validateCsv('a\n"x', two).errors.length, 1);
  assert.equal(validateCsv('a\n"x', two).errors[0].code, 'UNTERMINATED_QUOTE');
  assert.equal(validateCsv('a\nx"y\n', two).errors[0].code, 'BAD_QUOTE');
  assert.deepEqual(validateCsv('a\n', two), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a;b\n1;2\n', { columns: [{ name: 'b', type: 'int' }] }, { delimiter: ';' }).errors, []);
  assert.deepEqual(validateCsv('a\n"x\ny"\nz\n', { columns: [{ name: 'a', maxLength: 1 }] }).errors, [{ row: 2, column: 'a', code: 'MAX_LENGTH' }]);
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] }, { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', min: 'x' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) assert.equal(code(() => validateCsv('a\n1\n', s)), 'CSV_INVALID_SCHEMA', JSON.stringify(s));
  assert.equal(code(() => validateCsv(5, two)), 'CSV_INVALID_INPUT');
});

test('slug: fold, slugify, so khớp, sắp xếp', () => {
  assert.equal(S.fold('Đặng Thị Ánh'), 'Dang Thi Anh');
  assert.equal(S.fold('abc 123 !?'), 'abc 123 !?');
  assert.equal(S.fold('ệ'), 'e');
  const sl = S.slugify;
  assert.deepEqual([sl('Xin chào Việt Nam'), sl('Đường Đồng Khởi'), sl('  Hello,   World!!  '), sl('Phòng 101/B2'), sl('Straße'), sl('日本'), sl('１２')],
    ['xin-chao-viet-nam', 'duong-dong-khoi', 'hello-world', 'phong-101-b2', 'stra-e', '', '']);
  assert.equal(sl('xin chao viet nam', { maxLength: 12 }), 'xin-chao');
  assert.equal(sl('xin chao viet nam', { maxLength: 13 }), 'xin-chao-viet');
  assert.equal(sl('extraordinary day', { maxLength: 5 }), 'extra');
  for (const m of [0, 1.5, '3', -1, NaN]) assert.equal(code(() => sl('', { maxLength: m })), 'SLUG_INVALID_MAXLENGTH');
  for (const f of [S.fold, S.slugify, S.looseEquals, S.compareVi]) for (const bad of [null, undefined, 5]) assert.equal(code(() => f(bad, 'a')), 'SLUG_INVALID_INPUT');
  assert.equal(S.uniqueSlug('abc-2', ['abc-2']), 'abc-2-2');
  assert.equal(S.uniqueSlug('a', new Set(['a', 'a-2'])), 'a-3');
  assert.equal(code(() => S.uniqueSlug('', [])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.uniqueSlug('a', 'a')), 'SLUG_INVALID_INPUT');
  assert.equal(S.looseEquals('Đà   Nẵng ', 'da nang'), true);
  assert.equal(S.looseIncludes('Thành phố Hồ Chí Minh', 'ho chi'), true);
  assert.equal(S.looseIncludes('abc', '  '), true);
  const c = S.compareVi;
  assert.deepEqual([c('A', 'b'), c('ạ', 'b'), c('ặ', 'ấ'), c('a', 'Á'), c('á', 'A'), c('a', 'A'), c('an', 'anh'), c('', 'a'), c('y', 'f'), c('z', 'w'), c('1', 'a'), c('a', 'a')],
    [-1, -1, -1, -1, 1, -1, -1, -1, -1, 1, -1, 0]);
  assert.equal(c('ệ', 'ệ'), 0);
  assert.equal(c('ệ', 'ệ'.normalize('NFD')), 0);
  assert.deepEqual(S.sortVi(['Huế', 'Hải Phòng', 'Hà Nội', 'Gia Lai', 'Đồng Nai', 'Đà Nẵng', 'Cần Thơ', 'Bắc Ninh', 'An Giang']),
    ['An Giang', 'Bắc Ninh', 'Cần Thơ', 'Đà Nẵng', 'Đồng Nai', 'Gia Lai', 'Hà Nội', 'Hải Phòng', 'Huế']);
  assert.deepEqual(S.sortVi(['ạ', 'ã', 'á', 'ả', 'à', 'a']), ['a', 'à', 'ả', 'ã', 'á', 'ạ']);
  assert.equal(code(() => S.sortVi(['a', 1])), 'SLUG_INVALID_INPUT');
  assert.equal(code(() => S.sortVi('a')), 'SLUG_INVALID_INPUT');
});

test('ratelimit: token bucket và sliding window theo spec', () => {
  let t = 0;
  const now = () => t;
  const b = createTokenBucket({ capacity: 5, now });
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 1500;
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  t = 0;
  const b2 = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now });
  b2.take('k', 6);
  t = 666;
  assert.deepEqual(b2.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  t = 667;
  assert.equal(b2.take('k').allowed, true);
  t = 0;
  const b3 = createTokenBucket({ capacity: 2, now });
  b3.take('k', 2);
  t = 1000; b3.take('k');
  t = 500;
  assert.equal(b3.take('k').allowed, false);
  t = 2000;
  assert.equal(b3.take('k').allowed, true);
  assert.equal(code(() => b.take('', 0)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('k', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 1.5)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('new', 6)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(code(() => b.peek('new', 6)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.take('new2', 5).allowed, true);
  const n = b.size(); b.peek('zzz'); assert.equal(b.size(), n);
  assert.equal(b.reset('zzz'), false);
  assert.equal(b.reset('new2'), true);
  for (const o of [undefined, {}, { capacity: 0, now }, { capacity: 1 }, { capacity: 1, now, refillAmount: 0 }, { capacity: 1, now, refillIntervalMs: 1.5 }])
    assert.equal(code(() => createTokenBucket(o)), 'RL_INVALID_OPTIONS');
  t = 0;
  const b4 = createTokenBucket({ capacity: 2, now });
  b4.take('a'); b4.take('b', 2);
  t = 1000;
  assert.equal(b4.sweep(), 1);
  assert.equal(b4.size(), 1);
  t = 0;
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  t = 1000;
  assert.equal(w.take('k').allowed, true);
  t = 0;
  const w2 = createSlidingWindow({ limit: 4, windowMs: 1000, now });
  w2.take('k', 1); t = 100; w2.take('k', 2); t = 200; w2.take('k', 1);
  t = 300;
  assert.equal(w2.take('k', 3).retryAfterMs, 800);
  assert.equal(w2.take('k', 1).allowed, false);
  assert.equal(code(() => w2.take('k', 5)), 'RL_COST_EXCEEDS_CAPACITY');
  t = 5000;
  assert.equal(w2.size(), 1);
  assert.equal(w2.sweep(), 1);
  assert.equal(w2.size(), 0);
  for (const o of [undefined, { limit: 1, windowMs: 1 }, { limit: 0, windowMs: 1, now }, { limit: 1, windowMs: 0, now }])
    assert.equal(code(() => createSlidingWindow(o)), 'RL_INVALID_OPTIONS');
});
