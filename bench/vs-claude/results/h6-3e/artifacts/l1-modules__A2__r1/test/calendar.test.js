import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/calendar/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('ngày hợp lệ và cơ bản', () => {
  assert.equal(c.isValidDate('2000-02-29'), true);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', null, 5]) {
    assert.equal(c.isValidDate(bad), false);
  }
  throwsCode(() => c.dayOfWeek('2026-13-01'), 'CAL_INVALID_DATE');
  assert.equal(c.dayOfWeek('2026-04-26'), 7);
  assert.equal(c.dayOfWeek('2025-01-29'), 3);
  assert.equal(c.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(c.addDays('2024-03-01', -366), '2023-03-01');
  assert.equal(c.diffDays('2026-01-10', '2026-01-01'), -9);
  throwsCode(() => c.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => c.addDays('2020-01-01', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => c.addDays('bad', 1.5), 'CAL_INVALID_DATE');
});

test('dayInfo, nghỉ bù', () => {
  assert.deepEqual(c.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(c.dayInfo('2025-02-02').type, 'weekend');
  assert.equal(c.dayInfo('2025-01-27').type, 'working');
  const expected = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, b] of Object.entries(expected)) assert.equal(c.compensationFor(h), b);
  assert.equal(c.compensationFor('2025-01-29'), null);
  assert.equal(c.compensationFor('2025-03-03'), null);
  assert.deepEqual(c.nonWorkingDays(2027).filter((d) => d.type === 'compensation').map((d) => d.date),
    ['2027-02-11', '2027-02-12', '2027-05-03']);
  assert.deepEqual(c.nonWorkingDays(2030), []);
  assert.equal(c.nonWorkingDays(2025)[0].date, '2025-01-01');
});

test('addWorkingDays / roll', () => {
  assert.equal(c.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(c.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(c.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(c.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(c.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-02', 0), '2025-02-02');
  throwsCode(() => c.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  throwsCode(() => c.addWorkingDays('2025-01-01', 10001), 'CAL_INVALID_COUNT');
  assert.equal(c.rollForward('2025-02-01'), '2025-02-04');
  assert.equal(c.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(c.rollForward('2025-01-28'), '2025-01-28');
});

test('workingDaysBetween', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(c.workingDaysBetween(f, t), 2);
  assert.equal(c.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(c.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(c.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(c.workingDaysBetween(t, f), -2);
  assert.equal(c.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(c.workingDaysBetween(f, f, { bounds: 'both' }), 1);
  assert.equal(c.workingDaysBetween(f, f), 0);
  assert.ok(Object.is(c.workingDaysBetween('2026-04-26', '2026-04-25'), 0));
  throwsCode(() => c.workingDaysBetween(f, t, { bounds: 'x' }), 'CAL_INVALID_OPTION');
  assert.equal(c.addWorkingDays(f, c.workingDaysBetween(f, t, { bounds: 'end' })), t);
});

test('tuần ISO', () => {
  assert.deepEqual(c.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(c.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(c.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(c.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(c.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(c.isoWeeksInYear(y), 52);
  assert.equal(c.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(c.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(c.isoWeekToDate(2019, 1), '2018-12-31');
  throwsCode(() => c.isoWeekToDate(2021, 53), 'CAL_INVALID_WEEK');
  throwsCode(() => c.isoWeekToDate(2021, 1, 8), 'CAL_INVALID_WEEK');
  throwsCode(() => c.isoWeeksInYear(1800), 'CAL_INVALID_WEEK');
  assert.equal(c.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(c.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01', i = 0; i < 750; i++, d = c.addDays(d, 97)) {
    const w = c.isoWeek(d);
    assert.equal(c.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
