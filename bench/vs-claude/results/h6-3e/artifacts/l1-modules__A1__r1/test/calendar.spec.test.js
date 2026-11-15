import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate / ngày không hợp lệ', () => {
  for (const s of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(cal.isValidDate(s), true, s);
  const bad = ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05', ' 2026-01-05', '2026-13-01', '2026-00-10', '2026-04-31', null, 20260105, undefined];
  for (const s of bad) assert.equal(cal.isValidDate(s), false, String(s));
  assert.throws(() => cal.dayOfWeek('2026-1-5'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.addDays('bad', 'x'), code('CAL_INVALID_DATE'));
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(cal.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(cal.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(cal.addDays('2026-01-01', 0), '2026-01-01');
  assert.throws(() => cal.addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.equal(cal.diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(cal.diffDays('2026-01-31', '2026-01-01'), -30);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(cal.dayOfWeek('1900-01-01'), 1);
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  const pairs = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11', '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(pairs)) {
    assert.equal(cal.compensationFor(h), c);
    assert.equal(cal.dayInfo(c).type, 'compensation');
  }
  assert.equal(cal.compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(cal.compensationFor('2025-03-03'), null);
  assert.equal(cal.isWorkingDay('2027-02-11'), false);
  assert.equal(cal.isWorkingDay('2027-02-15'), true);
  assert.equal(cal.dayInfo('2027-05-01').type, 'holiday');
  const comps = [2025, 2026, 2027].flatMap((y) => cal.nonWorkingDays(y)).filter((d) => d.type === 'compensation');
  assert.equal(comps.length, 5);
});

test('nonWorkingDays', () => {
  const l = cal.nonWorkingDays(2027);
  assert.deepEqual(l.map((d) => d.date), [...l.map((d) => d.date)].sort());
  assert.deepEqual(l[0], { date: '2027-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(l.some((d) => d.date === '2027-02-12' && d.type === 'compensation'));
  assert.ok(!l.some((d) => d.type === 'weekend'));
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  assert.throws(() => cal.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays / roll', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => cal.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-1-1', 'x'), code('CAL_INVALID_DATE'));
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
});

test('workingDaysBetween', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  const w = (a, b, bounds) => cal.workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(w(f, t), 2);
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w(f, f, 'start'), 0);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  assert.ok(Object.is(w(t, t), 0));
  assert.ok(Object.is(w('2026-04-25', '2026-04-24'), 0));
  assert.throws(() => w(f, t, 'x'), code('CAL_INVALID_OPTION'));
  assert.throws(() => w('bad', t, 'x'), code('CAL_INVALID_DATE'));
  for (const [a, b] of [['2025-01-20', '2025-02-10'], ['2027-02-01', '2027-02-20']]) {
    if (cal.isWorkingDay(b)) assert.equal(cal.addWorkingDays(a, w(a, b, 'end')), b);
  }
});

test('tuần ISO', () => {
  assert.deepEqual(cal.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => cal.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01'; d < '2100-12-31'; d = cal.addDays(d, 1)) {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
