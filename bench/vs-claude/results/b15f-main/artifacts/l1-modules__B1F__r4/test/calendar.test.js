import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek,
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

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

test('isValidDate', () => {
  for (const s of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', '2026-00-10', null, 20260105, undefined]) {
    assert.equal(isValidDate(s), false, String(s));
  }
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(diffDays('2000-01-01', '2000-03-01'), 60);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 1e300), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays('2026-01-01', '2026-02-30'), code('CAL_INVALID_DATE'));
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2024-05-01'), { date: '2024-05-01', weekday: 3, type: 'working', name: null });
  const pairs = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(pairs)) assert.equal(compensationFor(h), c);
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-03-03'), null);
  assert.equal(isWorkingDay('2027-02-11'), false);
  assert.equal(isWorkingDay('2027-02-15'), true);
  assert.throws(() => compensationFor('x'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays', () => {
  const y25 = nonWorkingDays(2025);
  assert.equal(y25.length, 11);
  assert.deepEqual(y25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.deepEqual(y25.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(y25.map((x) => x.date), [...y25.map((x) => x.date)].sort());
  assert.equal(nonWorkingDays(2027).length, 14);
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-13-01', 1.5), code('CAL_INVALID_DATE'));
  assert.ok(addWorkingDays('2026-01-05', 10000) > '2060');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.throws(() => rollBackward('1900-01-01'.replace('01-01', '01-07')) && rollBackward('x'), code('CAL_INVALID_DATE'));
  assert.equal(rollBackward('1900-01-06'), '1900-01-05');
  assert.throws(() => rollForward('2100-12-31') && rollForward('x'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: biên, đảo chiều, lỗi', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const r = (a, b, bounds) => workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(r(f, t, 'start'), 2);
  assert.equal(r(f, t, 'end'), 2);
  assert.equal(r(f, t, 'both'), 3);
  assert.equal(r(f, t, 'neither'), 1);
  assert.equal(r(t, f, 'start'), -2);
  assert.equal(r(t, f, 'end'), -2);
  assert.equal(r(t, f, 'both'), -3);
  assert.equal(r(t, f, 'neither'), -1);
  assert.equal(r(t, f), -2);
  assert.equal(r('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(r('2026-04-25', '2026-04-25', 'both'), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(r('2026-04-28', '2026-04-28', b), 0);
  assert.ok(Object.is(r('2026-04-25', '2026-04-26', 'start'), 0));
  assert.ok(Object.is(r('2026-04-26', '2026-04-25', 'start'), 0));
  assert.equal(workingDaysBetween(f, t, null), 2);
  assert.throws(() => r(f, t, 'foo'), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('x', t, { bounds: 'foo' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(f, 'x', { bounds: 'foo' }), code('CAL_INVALID_DATE'));
  const from = '2025-01-27', to = '2025-02-04';
  assert.equal(addWorkingDays(from, workingDaysBetween(from, to, { bounds: 'end' })), to);
});

test('tuần ISO', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1.5), code('CAL_INVALID_WEEK'));
  for (let d = '2019-01-01'; d <= '2022-12-31'; d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
