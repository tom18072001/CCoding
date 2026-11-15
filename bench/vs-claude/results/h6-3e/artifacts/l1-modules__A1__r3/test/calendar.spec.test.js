import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate và lỗi', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(C.isValidDate(ok), true, ok);
  for (const bad of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05', ' 2026-01-05', '2026-13-01', '2026-00-10', '2026-04-31', 5, null, undefined]) {
    assert.equal(C.isValidDate(bad), false, String(bad));
  }
  assert.throws(() => C.dayOfWeek('2026-1-5'), code('CAL_INVALID_DATE'));
  assert.throws(() => C.addDays(5, 1), code('CAL_INVALID_DATE'));
  assert.throws(() => C.addDays('bad', 'x'), code('CAL_INVALID_DATE'));
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(C.diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(C.diffDays('2026-01-31', '2026-01-01'), -30);
  assert.ok(Object.is(C.diffDays('2026-01-01', '2026-01-01'), 0));
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
  assert.equal(C.dayOfWeek('1900-01-01'), 1);
  assert.throws(() => C.addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('2026-01-01', 1e9), code('CAL_OUT_OF_RANGE'));
});

test('dayInfo và nghỉ bù', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.equal(C.dayInfo('2025-02-05').type, 'working');
  const table = {
    '2025-02-01': '2025-02-03',
    '2026-04-26': '2026-04-27',
    '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12',
    '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(table)) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-03-03'), null);
  const all = C.nonWorkingDays(2025).concat(C.nonWorkingDays(2026), C.nonWorkingDays(2027));
  assert.equal(all.filter((d) => d.type === 'compensation').length, 5);
  assert.equal(C.isWorkingDay('2027-02-11'), false);
  assert.equal(C.isWorkingDay('2027-02-15'), true);
});

test('nonWorkingDays', () => {
  const d = C.nonWorkingDays(2025);
  assert.deepEqual(d[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.equal(d.length, 11); // 10 ngày lễ + 1 ngày bù
  assert.deepEqual(C.nonWorkingDays(2030), []);
  for (let i = 1; i < d.length; i++) assert.ok(d[i - 1].date < d[i].date);
  assert.throws(() => C.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => C.nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
  assert.throws(() => C.nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
});

test('addWorkingDays, roll', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => C.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2026-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.equal(C.rollForward('2025-02-01'), '2025-02-04');
  assert.equal(C.rollForward('2025-02-04'), '2025-02-04');
  assert.equal(C.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(C.rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu
  assert.equal(C.rollBackward('1900-01-06'), '1900-01-05');
  assert.throws(() => C.rollForward('2100-12-31') && C.addWorkingDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
});

test('workingDaysBetween', () => {
  const w = (a, b, bounds) => C.workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(w('2026-04-24', '2026-04-29'), 2);
  assert.equal(w('2026-04-24', '2026-04-29', 'start'), 2);
  assert.equal(w('2026-04-24', '2026-04-29', 'end'), 2);
  assert.equal(w('2026-04-24', '2026-04-29', 'both'), 3);
  assert.equal(w('2026-04-24', '2026-04-29', 'neither'), 1);
  assert.equal(w('2026-04-29', '2026-04-24', 'start'), -2);
  assert.equal(w('2026-04-29', '2026-04-24', 'both'), -3);
  assert.equal(w('2026-04-29', '2026-04-24', 'end'), -2);
  assert.equal(w('2026-04-29', '2026-04-24', 'neither'), -1);
  assert.equal(w('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  assert.equal(w('2026-04-28', '2026-04-28', 'start'), 0);
  assert.ok(Object.is(w('2026-04-29', '2026-04-28', 'neither'), 0));
  assert.throws(() => w('2026-04-24', '2026-04-29', 'x'), code('CAL_INVALID_OPTION'));
  assert.throws(() => w('bad', '2026-04-29', 'x'), code('CAL_INVALID_DATE'));
  assert.throws(() => w('2026-04-24', 'bad', 'x'), code('CAL_INVALID_DATE'));
  const from = '2025-01-20';
  const to = '2025-03-05';
  assert.equal(C.addWorkingDays(from, w(from, to, 'end')), to);
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
  assert.throws(() => C.isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2021, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let d = '1900-01-01'; ; d = C.addDays(d, 1)) {
    const w = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
    if (d === '2100-12-31') break;
  }
});
