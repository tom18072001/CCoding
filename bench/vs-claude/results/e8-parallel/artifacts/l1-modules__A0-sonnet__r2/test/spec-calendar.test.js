import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const code = (f, c) => assert.throws(f, (e) => e.code === c);

test('ngày hợp lệ và lỗi', () => {
  assert.ok(C.isValidDate('2000-02-29'));
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null])
    assert.equal(C.isValidDate(s), false);
  code(() => C.dayOfWeek('x'), 'CAL_INVALID_DATE');
  code(() => C.addDays('x', 1.5), 'CAL_INVALID_DATE');
  code(() => C.addDays('2026-01-01', 1.5), 'CAL_INVALID_COUNT');
  code(() => C.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.diffDays('2026-01-10', '2026-01-01'), -9);
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
});
test('nghỉ bù', () => {
  const m = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11', '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(m)) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-03-01'), null);
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(C.dayInfo('2025-02-02').type, 'weekend');
  assert.equal(C.nonWorkingDays(2028).length, 0);
  const n27 = C.nonWorkingDays(2027).map((x) => x.date);
  assert.deepEqual(n27, [...n27].sort());
  assert.ok(n27.includes('2027-02-12') && !n27.includes('2027-02-13'));
});
test('addWorkingDays và roll', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  code(() => C.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  code(() => C.addWorkingDays('2025-01-01', 10001), 'CAL_INVALID_COUNT');
  assert.equal(C.rollForward('2026-04-25'), '2026-04-28');
  assert.equal(C.rollBackward('2026-04-27'), '2026-04-24');
  assert.equal(C.rollForward('2026-04-28'), '2026-04-28');
});
test('workingDaysBetween', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => C.workingDaysBetween(a, b, { bounds });
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(C.workingDaysBetween(f, f), 0);
  assert.equal(w(f, f, 'both'), 1);
  assert.ok(Object.is(C.workingDaysBetween(t, t), 0));
  assert.ok(Object.is(w('2026-04-25', '2026-04-24', 'neither'), 0));
  code(() => w(f, t, 'x'), 'CAL_INVALID_OPTION');
  assert.equal(C.addWorkingDays(f, w(f, t, 'end')), t);
});
test('tuần ISO', () => {
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(C.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(C.isoWeeksInYear(y), 52);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  code(() => C.isoWeekToDate(2021, 53), 'CAL_INVALID_WEEK');
  code(() => C.isoWeekToDate(2021, 1, 8), 'CAL_INVALID_WEEK');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01', i = 0; i < 800; i++, d = C.addDays(d, 37)) {
    const w = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
