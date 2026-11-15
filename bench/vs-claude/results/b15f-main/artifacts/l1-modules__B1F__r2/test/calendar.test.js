import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, nonWorkingDays,
  addWorkingDays, rollForward, rollBackward, workingDaysBetween, isoWeek, isoWeeksInYear,
  isoWeekToDate, formatIsoWeek,
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

const HOLIDAYS = {
  2025: ['01-01', '01-29', '01-30', '01-31', '02-01', '04-07', '04-30', '05-01', '09-01', '09-02'],
  2026: ['01-01', '02-16', '02-17', '02-18', '02-19', '02-20', '04-26', '04-30', '05-01', '09-02', '09-03'],
  2027: ['01-01', '02-06', '02-07', '02-08', '02-09', '02-10', '04-16', '04-30', '05-01', '09-02', '09-03'],
};

test('từng ngày lễ trong bảng có type holiday, kể cả cuối tuần', () => {
  for (const [y, list] of Object.entries(HOLIDAYS)) {
    for (const md of list) {
      const info = dayInfo(`${y}-${md}`);
      assert.equal(info.type, 'holiday', `${y}-${md}`);
      assert.ok(info.name);
      assert.equal(isWorkingDay(`${y}-${md}`), false);
    }
  }
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-03-01'), { date: '2025-03-01', weekday: 6, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-03-03'), { date: '2025-03-03', weekday: 1, type: 'working', name: null });
});

test('ngày nghỉ bù theo bảng', () => {
  const comp = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(comp)) {
    assert.equal(compensationFor(h), c);
    assert.equal(dayInfo(c).type, 'compensation');
  }
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-03-03'), null);
  assert.equal(nonWorkingDays(2027).filter((x) => x.type === 'compensation').length, 3);
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2025);
  assert.equal(l.length, 11);
  assert.equal(l[0].date, '2025-01-01');
  assert.deepEqual(l.at(-1), { date: '2025-09-02', type: 'holiday', name: 'Quốc khánh' });
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
});

test('ngày hợp lệ, 29/02, cơ bản', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-1-5'), false);
  assert.equal(isValidDate('2026/01/05'), false);
  assert.equal(isValidDate(' 2026-01-05'), false);
  assert.equal(isValidDate('1899-12-31'), false);
  assert.equal(isValidDate('2101-01-01'), false);
  assert.equal(isValidDate(20260105), false);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(diffDays('2026-01-01', '2025-01-01'), -365);
  assert.equal(diffDays('2024-01-01', '2025-01-01'), 366);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
});

test('addWorkingDays', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-27', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-27', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('bad', 1.5), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2100-12-31'), '2100-12-31');
  assert.equal(rollForward('2100-12-31'), '2100-12-31');
  assert.equal(rollForward('1900-01-01'), '1900-01-01');
});

test('workingDaysBetween: bốn biên, đảo chiều, bằng nhau', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween(f, f, { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween(f, f), 0);
  assert.equal(workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween(t, t), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-24'), 0));
  const e = workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' });
  assert.equal(addWorkingDays('2025-01-27', e), '2025-02-04');
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('x', 'y', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(f, 'y', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('tuần ISO', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '2019-12-20'; d < '2021-01-10'; d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
});

test('mã lỗi cơ bản', () => {
  assert.throws(() => addDays('2025-13-01', 1), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => diffDays('2025-01-01', null), code('CAL_INVALID_DATE'));
  assert.throws(() => dayOfWeek(undefined), code('CAL_INVALID_DATE'));
  assert.throws(() => isWorkingDay('2025-02-30'), code('CAL_INVALID_DATE'));
  assert.throws(() => formatIsoWeek('x'), code('CAL_INVALID_DATE'));
});
