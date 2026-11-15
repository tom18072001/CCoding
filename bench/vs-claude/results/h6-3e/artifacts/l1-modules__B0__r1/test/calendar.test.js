import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek,
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate: biên, năm nhuận, cú pháp', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
  assert.equal(isValidDate('1899-12-31'), false);
  assert.equal(isValidDate('2101-01-01'), false);
  for (const s of ['2026-1-5', '2026/01/05', ' 2026-01-05', '2026-13-01', '2026-00-10', '2026-04-31', null, 20260105]) {
    assert.equal(isValidDate(s), false, String(s));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2025-01-01', '2024-01-01'), -366);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
});

test('dayInfo và loại ngày', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.equal(dayInfo('2025-01-28').type, 'working');
  assert.equal(dayInfo('2024-01-01').type, 'working');
});

test('nghỉ bù: bảng trong đặc tả', () => {
  const exp = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(exp)) {
    assert.equal(compensationFor(h), c, h);
    assert.equal(dayInfo(c).type, 'compensation');
  }
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-02-02'), null);
  const all = [2025, 2026, 2027].flatMap((y) => nonWorkingDays(y)).filter((x) => x.type === 'compensation');
  assert.equal(all.length, 5);
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2025);
  assert.equal(l[0].date, '2025-01-01');
  assert.deepEqual(l.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(l.map((x) => x.date), [...l.map((x) => x.date)].sort());
  assert.equal(l.length, 11); // 10 ngày lễ + 1 ngày bù
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('x', 10001), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.throws(() => rollForward('2100-12-31'.replace('31', '32')), code('CAL_INVALID_DATE'));
  assert.equal(rollBackward('2100-12-26'), '2100-12-24');
});

test('workingDaysBetween: 4 kiểu biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f, { bounds: 'start' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28'), 0);
  assert.equal(workingDaysBetween('2025-02-01', '2025-02-01', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2025-02-02', '2025-02-01', { bounds: 'both' }), 0));
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const f = '2025-01-20', t = '2025-02-10';
  assert.equal(addWorkingDays(f, workingDaysBetween(f, t, { bounds: 'end' })), t);
});

test('tuần ISO vắt năm', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '2019-12-20'; d < '2021-01-10'; d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

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
