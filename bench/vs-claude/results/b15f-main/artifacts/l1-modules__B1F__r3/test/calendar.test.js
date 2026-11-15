import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

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

test('ngày không hợp lệ', () => {
  for (const s of ['2025-02-29', '1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-00-10', null, 20260105]) {
    assert.equal(cal.isValidDate(s), false, String(s));
  }
  assert.equal(cal.isValidDate('2000-02-29'), true);
  assert.equal(cal.isValidDate('2024-02-29'), true);
  assert.equal(code(() => cal.dayOfWeek('2025-02-29')), 'CAL_INVALID_DATE');
  assert.equal(code(() => cal.addDays('2025-02-29', 'x')), 'CAL_INVALID_DATE');
  assert.equal(code(() => cal.nonWorkingDays(1899)), 'CAL_INVALID_DATE');
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(cal.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(cal.addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(cal.diffDays('2025-03-01', '2025-02-01'), -28);
  assert.equal(cal.diffDays('2025-03-01', '2025-03-01'), 0);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(code(() => cal.addDays('2025-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => cal.addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => cal.addDays('1900-01-01', -1)), 'CAL_OUT_OF_RANGE');
});

test('dayInfo và nghỉ bù khi lễ trùng cuối tuần', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(cal.dayInfo('2025-02-02').type, 'weekend');
  assert.equal(cal.dayInfo('2025-01-28').name, null);
  const pairs = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(pairs)) {
    assert.equal(cal.compensationFor(h), c);
    assert.equal(cal.dayInfo(c).type, 'compensation');
  }
  assert.equal(cal.compensationFor('2025-01-29'), null);
  assert.equal(cal.compensationFor('2025-01-28'), null);
  assert.equal(cal.dayInfo('2027-02-13').type, 'weekend');
});

test('nonWorkingDays', () => {
  const d = cal.nonWorkingDays(2027).map((x) => x.date);
  assert.deepEqual(d.slice(-2), ['2027-09-02', '2027-09-03']);
  assert.ok(d.includes('2027-02-11') && d.includes('2027-02-12') && d.includes('2027-05-03'));
  assert.deepEqual([...d].sort(), d);
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  assert.deepEqual(cal.nonWorkingDays(2025)[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
});

test('addWorkingDays: n dương, âm, 0 và biên', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(cal.addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.equal(code(() => cal.addWorkingDays('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => cal.addWorkingDays('2025-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => cal.addWorkingDays('2025-01-01', -10001)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => cal.addWorkingDays('2025-01-01', NaN)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => cal.addWorkingDays('bad', 'x')), 'CAL_INVALID_DATE');
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31');
  assert.equal(cal.rollBackward('1900-01-01'), '1900-01-01');
});

test('workingDaysBetween: các biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => cal.workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w('2025-01-28', '2025-01-28', 'both'), 1);
  assert.equal(w('2025-01-29', '2025-01-29', 'both'), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(w('2025-01-28', '2025-01-28', b), 0);
  assert.ok(Object.is(w('2025-02-01', '2025-01-30', 'start'), 0));
  assert.equal(w('2026-04-29', '2026-04-24'), -w('2026-04-24', '2026-04-29', 'end'));
  assert.equal(code(() => w(f, t, 'x')), 'CAL_INVALID_OPTION');
  assert.equal(code(() => w('bad', t, 'x')), 'CAL_INVALID_DATE');
  const n = w('2025-01-20', '2025-02-10', 'end');
  assert.equal(cal.addWorkingDays('2025-01-20', n), '2025-02-10');
});

test('tuần ISO: 53 tuần, tuần 1 thuộc năm trước, round-trip', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(code(() => cal.isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => cal.isoWeekToDate(2025, 0)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => cal.isoWeekToDate(2025, 1, 8)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => cal.isoWeekToDate(1899, 1)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => cal.isoWeeksInYear(2101)), 'CAL_INVALID_WEEK');
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01'; d <= '2100-12-31'; d = cal.diffDays(d, '2100-12-31') >= 37 ? cal.addDays(d, 37) : '2101') {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
