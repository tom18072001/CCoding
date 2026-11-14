import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('ngày hợp lệ', () => {
  assert.ok(C.isValidDate('2000-02-29'));
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null]) {
    assert.equal(C.isValidDate(s), false, String(s));
  }
  assert.equal(code(() => C.dayOfWeek('x')), 'CAL_INVALID_DATE');
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
  assert.equal(code(() => C.addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => C.addDays('2100-12-31', 1.5)), 'CAL_INVALID_COUNT');
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), {
    date: '2025-02-03',
    weekday: 1,
    type: 'compensation',
    name: 'Nghỉ bù Tết Nguyên đán',
  });
  const pairs = {
    '2025-02-01': '2025-02-03',
    '2026-04-26': '2026-04-27',
    '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12',
    '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(pairs)) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-01'), null);
  assert.equal(C.compensationFor('2025-03-03'), null);
  assert.equal(C.nonWorkingDays(2024).length, 0);
  const nw = C.nonWorkingDays(2027);
  assert.ok(nw.some((e) => e.date === '2027-02-12' && e.type === 'compensation'));
  assert.deepEqual(nw.map((e) => e.date), [...nw.map((e) => e.date)].sort());
});

test('addWorkingDays và roll', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(code(() => C.addWorkingDays('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => C.addWorkingDays('2025-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(C.rollForward('2025-02-01'), '2025-02-04');
  assert.equal(C.rollBackward('2025-02-03'), '2025-01-28');
});

test('workingDaysBetween', () => {
  const w = (f, t, bounds) => C.workingDaysBetween(f, t, { bounds });
  const [f, t] = ['2026-04-24', '2026-04-29'];
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => w(f, t, b)), [2, 2, 3, 1]);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(C.workingDaysBetween(f, f), 0);
  assert.equal(w(f, f, 'both'), 1);
  assert.ok(Object.is(C.workingDaysBetween('2025-02-01', '2025-02-02'), 0));
  assert.ok(Object.is(C.workingDaysBetween('2025-02-02', '2025-02-01'), 0));
  assert.equal(code(() => w(f, t, 'x')), 'CAL_INVALID_OPTION');
});

test('tuần ISO', () => {
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual([2020, 2026, 2015, 2021, 2024, 2025].map(C.isoWeeksInYear), [53, 53, 53, 52, 52, 52]);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(code(() => C.isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01'; d < '2100-12-01'; d = C.addDays(d, 37)) {
    const x = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(x.year, x.week, x.weekday), d);
  }
});
