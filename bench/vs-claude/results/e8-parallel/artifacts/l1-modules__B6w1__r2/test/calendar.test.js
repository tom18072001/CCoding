import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

import * as cal from '../src/calendar/index.js';

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

const code = (fn, c) => assert.throws(fn, (e) => e.code === c);

test('isValidDate và lỗi ngày', () => {
  assert.equal(cal.isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null, '2026-13-01'])
    assert.equal(cal.isValidDate(s), false);
  code(() => cal.addDays('2026-1-5', 1), 'CAL_INVALID_DATE');
  code(() => cal.addDays('bad', 'x'), 'CAL_INVALID_DATE');
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(cal.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(cal.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(cal.diffDays('2026-01-05', '2026-01-01'), -4);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  code(() => cal.addDays('2026-01-01', 1.5), 'CAL_INVALID_COUNT');
  code(() => cal.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  code(() => cal.addDays('1900-01-01', -1), 'CAL_OUT_OF_RANGE');
});

test('dayInfo và compensationFor', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(cal.dayInfo('2025-02-02').type, 'weekend');
  const comps = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(comps)) assert.equal(cal.compensationFor(h), c);
  assert.equal(cal.compensationFor('2025-01-29'), null);
  assert.equal(cal.compensationFor('2025-03-01'), null);
});

test('nonWorkingDays', () => {
  const l = cal.nonWorkingDays(2027).map((x) => x.date);
  assert.deepEqual(l.slice(0, 8), ['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12']);
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  code(() => cal.nonWorkingDays(1899), 'CAL_INVALID_DATE');
  code(() => cal.nonWorkingDays('2026'), 'CAL_INVALID_DATE');
});

test('addWorkingDays theo ví dụ spec', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02');
  code(() => cal.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  code(() => cal.addWorkingDays('2026-01-01', 10001), 'CAL_INVALID_COUNT');
  code(() => cal.addWorkingDays('2026-01-01', NaN), 'CAL_INVALID_COUNT');
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-02-01'), '2025-02-04');
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31');
  assert.equal(cal.rollBackward('1900-01-07'), '1900-01-05');
});

test('workingDaysBetween các biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const r = (a, b, bounds) => cal.workingDaysBetween(a, b, { bounds });
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => r(f, t, b)), [2, 2, 3, 1]);
  assert.equal(r(t, f, 'start'), -2);
  assert.equal(r(t, f, 'both'), -3);
  assert.equal(r(t, f, 'end'), -2);
  assert.equal(r(t, f, 'neither'), -1);
  assert.equal(r(f, f, 'both'), 1);
  assert.equal(r(f, f, 'start'), 0);
  assert.equal(Object.is(r('2026-04-26', '2026-04-25', 'start'), 0), true);
  assert.equal(cal.workingDaysBetween(f, t), 2);
  code(() => cal.workingDaysBetween(f, t, { bounds: 'x' }), 'CAL_INVALID_OPTION');
  code(() => cal.workingDaysBetween('bad', t, { bounds: 'x' }), 'CAL_INVALID_DATE');
  const n = cal.workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' });
  assert.equal(cal.addWorkingDays('2025-01-27', n), '2025-02-04');
});

test('tuần ISO đầy đủ', () => {
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  code(() => cal.isoWeekToDate(2025, 53), 'CAL_INVALID_WEEK');
  code(() => cal.isoWeekToDate(2025, 1, 8), 'CAL_INVALID_WEEK');
  code(() => cal.isoWeekToDate(1899, 1), 'CAL_INVALID_WEEK');
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '2024-12-20', i = 0; i < 400; i++, d = cal.addDays(d, 1)) {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
