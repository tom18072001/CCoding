import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, nonWorkingDays,
  addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
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

test('isValidDate / lỗi CAL_INVALID_DATE', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('2026-1-5'), false);
  assert.equal(isValidDate('2101-01-01'), false);
  assert.equal(isValidDate(20260105), false);
  assert.throws(() => addDays('2026/01/05', 1), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
});

test('addDays, diffDays, dayOfWeek, lỗi', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(diffDays('2026-04-29', '2026-04-24'), -5);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(dayInfo('2025-02-02').type, 'weekend');
  assert.equal(compensationFor('2026-04-26'), '2026-04-27');
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-03-03'), null);
});

test('nghỉ bù rơi vào ngày lễ khác: 2027 Tết', () => {
  assert.equal(compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(compensationFor('2027-02-07'), '2027-02-12');
  assert.equal(compensationFor('2027-05-01'), '2027-05-03');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2027);
  assert.equal(l[0].date, '2027-01-01');
  assert.ok(l.some((x) => x.date === '2027-02-12' && x.type === 'compensation'));
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.equal(nonWorkingDays(2025).length, 11);
});

test('addWorkingDays: âm, 0, lỗi', () => {
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, ngày làm việc
  assert.equal(rollForward('2100-12-25'), '2100-12-27');
  assert.equal(rollBackward('1900-01-06'), '1900-01-05');
});

test('workingDaysBetween: biên, đảo chiều, lỗi', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w(f, f, 'start'), 0);
  assert.equal(w('2025-01-29', '2025-01-29', 'both'), 0);
  assert.ok(Object.is(w('2025-02-01', '2025-01-31', 'end'), 0));
  assert.equal(addWorkingDays('2025-01-27', w('2025-01-27', '2025-02-04', 'end')), '2025-02-04');
  assert.throws(() => w(f, t, 'x'), code('CAL_INVALID_OPTION'));
  assert.throws(() => w('bad', t, 'x'), code('CAL_INVALID_DATE'));
});

test('tuần ISO: biên năm, 52/53/1', () => {
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
  assert.throws(() => isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  let d = '2019-12-20';
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) {
    const x = isoWeek(d);
    assert.equal(isoWeekToDate(x.year, x.week, x.weekday), d);
  }
});
