import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

test('cuối tuần và ngày lễ không phải ngày làm việc', () => {
  assert.equal(isWorkingDay('2025-01-28'), true);
  assert.equal(isWorkingDay('2025-01-29'), false);
  assert.equal(isWorkingDay('2025-02-01'), false);
});

test('ngày bù: lễ thứ Bảy 1/2/2025 bù vào thứ Hai 3/2', () => {
  assert.equal(isWorkingDay('2025-02-03'), false);
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
});

test('đếm ngày làm việc, biên mặc định [from, to)', () => {
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29'), 2);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'both' }), 3);
});

test('tuần ISO của đầu năm', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
});

const code = (c) => (e) => e.code === c;

test('isValidDate: cú pháp, năm nhuận, khoảng', () => {
  assert.equal(C.isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', null, 20260105]) {
    assert.equal(C.isValidDate(s), false, String(s));
  }
  assert.equal(C.isValidDate('1900-01-01'), true);
  assert.equal(C.isValidDate('2100-12-31'), true);
});

test('addDays / diffDays / dayOfWeek, 29/02 và ranh giới năm', () => {
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(C.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.diffDays('2025-12-31', '2026-01-01'), 1);
  assert.equal(C.diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(C.dayInfo('2025-02-02').type, 'weekend');
  assert.equal(C.dayInfo('2025-02-02').name, null);
  assert.equal(C.dayInfo('2026-04-26').type, 'holiday');
  const pairs = [['2025-02-01', '2025-02-03'], ['2026-04-26', '2026-04-27'], ['2027-02-06', '2027-02-11'], ['2027-02-07', '2027-02-12'], ['2027-05-01', '2027-05-03']];
  for (const [h, c] of pairs) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-03-03'), null);
});

test('nonWorkingDays', () => {
  const l = C.nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date).slice(0, 8), ['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12']);
  assert.equal(l.find((x) => x.date === '2027-05-03').type, 'compensation');
  assert.deepEqual(C.nonWorkingDays(2030), []);
  assert.ok(C.nonWorkingDays(2025).some((x) => x.date === '2025-02-03'));
});

test('addWorkingDays: ví dụ SPEC, n âm/0, qua Tết', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(C.addWorkingDays('2025-12-31', 1), '2026-01-02');
});

test('rollForward / rollBackward', () => {
  assert.equal(C.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(C.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(C.rollBackward('2025-02-03'), '2025-01-28');
});

test('workingDaysBetween: bốn biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(C.workingDaysBetween(t, f), -2);
  assert.equal(C.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(C.workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(C.workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(C.workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'both' }), 1);
  assert.equal(C.workingDaysBetween('2026-04-28', '2026-04-28'), 0);
  assert.equal(C.workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(C.workingDaysBetween('2026-04-25', '2026-04-26'), 0));
  assert.ok(Object.is(C.workingDaysBetween('2026-04-26', '2026-04-25'), 0));
  const n = C.workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' });
  assert.equal(n, 2);
  assert.equal(C.addWorkingDays('2025-01-27', n), '2025-02-04');
});

test('tuần ISO: 1, 52, 53, năm ISO khác năm dương lịch', () => {
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(C.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(C.isoWeeksInYear(y), 52);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['1900-01-01', '2000-02-29', '2100-01-01', '2100-12-31', '2024-12-30', '2027-01-03']) {
    const w = C.isoWeek(d);
    if (w.year >= 1900 && w.year <= 2100) assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('CAL_INVALID_DATE (kiểm ngày trước tham số khác)', () => {
  for (const f of [() => C.addDays('2026-1-5', 1), () => C.diffDays('x', '2026-01-01'), () => C.dayOfWeek(5), () => C.dayInfo('2100-12-32'),
    () => C.isWorkingDay(null), () => C.compensationFor('1899-12-31'), () => C.nonWorkingDays(1899), () => C.nonWorkingDays(2026.5),
    () => C.workingDaysBetween('bad', '2026-01-01', { bounds: 'zzz' }), () => C.addWorkingDays('bad', 1.5), () => C.formatIsoWeek('2026/01/01')]) {
    assert.throws(f, code('CAL_INVALID_DATE'));
  }
});

test('CAL_INVALID_COUNT', () => {
  assert.throws(() => C.addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addDays('2026-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addDays('2026-01-01', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2026-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2026-01-01', Infinity), code('CAL_INVALID_COUNT'));
});

test('CAL_OUT_OF_RANGE', () => {
  assert.throws(() => C.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('2000-01-01', 1e9), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.isoWeekToDate(2100, 52, 7), code('CAL_OUT_OF_RANGE'));
});

test('CAL_INVALID_OPTION', () => {
  assert.throws(() => C.workingDaysBetween('2026-01-01', '2026-01-05', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => C.workingDaysBetween('2026-01-01', '2026-01-05', { bounds: null }), code('CAL_INVALID_OPTION'));
});

test('CAL_INVALID_WEEK', () => {
  assert.throws(() => C.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeeksInYear('2025'), code('CAL_INVALID_WEEK'));
});
