import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';

const {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} = cal;
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('isValidDate', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(ok), true);
  for (const bad of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05',
    ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10', '2026-04-31', null, 20260105, undefined]) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(diffDays('2025-01-01', '2026-01-01'), 365);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(code(() => addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => addDays('1900-01-01', -1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => addDays('2020-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => addDays('bad', 1.5)), 'CAL_INVALID_DATE');
  assert.equal(code(() => addDays('2020-01-01', 1e20)), 'CAL_INVALID_COUNT');
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(dayInfo('2025-02-02').type, 'weekend');
  assert.equal(dayInfo('2025-02-04').type, 'working');
  const comps = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(comps)) {
    assert.equal(compensationFor(h), c);
    assert.equal(dayInfo(c).type, 'compensation');
  }
  assert.equal(compensationFor('2025-01-01'), null);
  assert.equal(compensationFor('2025-03-03'), null);
  assert.equal(isWorkingDay('2025-02-03'), false);
  assert.equal(isWorkingDay('2025-02-04'), true);
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date).slice(0, 9),
    ['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', '2027-04-16']);
  assert.equal(l.find((x) => x.date === '2027-02-11').type, 'compensation');
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.equal(code(() => nonWorkingDays(1899)), 'CAL_INVALID_DATE');
  assert.equal(code(() => nonWorkingDays('2026')), 'CAL_INVALID_DATE');
  assert.equal(nonWorkingDays(2025).some((x) => x.date === '2025-02-03'), true);
});

test('addWorkingDays / roll', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(code(() => addWorkingDays('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => addWorkingDays('2020-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => addWorkingDays('2020-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(rollForward('2025-02-01'), '2025-02-04');
  assert.equal(rollForward('2025-02-04'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
});

test('workingDaysBetween', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w(f, f, 'start'), 0);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  assert.ok(Object.is(w('2026-04-25', '2026-04-26', 'start'), 0));
  assert.ok(Object.is(w('2026-04-26', '2026-04-25', 'start'), 0));
  assert.equal(code(() => w(f, t, 'x')), 'CAL_INVALID_OPTION');
  assert.equal(code(() => w('bad', t, 'x')), 'CAL_INVALID_DATE');
  // tính chất
  for (const from of ['2025-01-20', '2025-01-30', '2027-02-05']) {
    const to = '2027-03-10';
    assert.equal(addWorkingDays(from, w(from, to, 'end')), to);
  }
});

test('tuần ISO', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(code(() => isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => isoWeekToDate(2025, 0)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => isoWeekToDate(2025, 1, 8)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => isoWeekToDate(1899, 1)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => isoWeeksInYear(2101)), 'CAL_INVALID_WEEK');
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01'; d < '2100-12-01'; d = addDays(d, 13)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
