import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('isValidDate: cú pháp, năm nhuận, khoảng', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(C.isValidDate(ok), true, ok);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', null, 20260105, undefined])
    assert.equal(C.isValidDate(bad), false, String(bad));
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(C.diffDays('2025-01-01', '2024-12-31'), -1);
  assert.ok(Object.is(C.diffDays('2025-01-01', '2025-01-01'), 0));
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
  assert.equal(C.dayOfWeek('1900-01-01'), 1);
  throwsCode(() => C.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => C.addDays('1900-01-01', -1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => C.addDays('2025-01-01', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => C.addDays('bad', 1.5), 'CAL_INVALID_DATE');
});

test('dayInfo và các loại ngày', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(C.dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(C.dayInfo('2030-01-01').type, 'working');
});

test('nghỉ bù: đúng bảng, không nhảy vào lễ, không dùng chung', () => {
  const exp = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(exp)) assert.equal(C.compensationFor(h), c, h);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-03-03'), null);
  assert.equal(C.dayInfo('2027-02-12').type, 'compensation');
});

test('nonWorkingDays', () => {
  const l = C.nonWorkingDays(2025);
  assert.equal(l[0].date, '2025-01-01');
  assert.deepEqual(l.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(l.length, 11);
  assert.deepEqual(C.nonWorkingDays(2030), []);
  assert.deepEqual(C.nonWorkingDays(2027).map((x) => x.date).slice(-3), ['2027-05-03', '2027-09-02', '2027-09-03']);
  for (const y of [1899, 2101, 2025.5, '2025']) throwsCode(() => C.nonWorkingDays(y), 'CAL_INVALID_DATE');
});

test('addWorkingDays: ví dụ đặc tả và biên', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  throwsCode(() => C.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  throwsCode(() => C.addWorkingDays('2025-01-01', 10001), 'CAL_INVALID_COUNT');
  throwsCode(() => C.addWorkingDays('2025-01-01', NaN), 'CAL_INVALID_COUNT');
  throwsCode(() => C.addWorkingDays('2025-1-1', 99999), 'CAL_INVALID_DATE');
  assert.equal(typeof C.addWorkingDays('2025-01-01', 10000), 'string');
});

test('rollForward / rollBackward', () => {
  assert.equal(C.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(C.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(C.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(C.rollBackward('2025-01-28'), '2025-01-28');
  throwsCode(() => C.rollForward('bad'), 'CAL_INVALID_DATE');
  assert.equal(C.rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.equal(C.rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc
});

test('workingDaysBetween: biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const r = (a, b, bounds) => C.workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(r(f, t), 2);
  assert.equal(r(f, t, 'start'), 2);
  assert.equal(r(f, t, 'end'), 2);
  assert.equal(r(f, t, 'both'), 3);
  assert.equal(r(f, t, 'neither'), 1);
  assert.equal(r(t, f, 'start'), -2);
  assert.equal(r(t, f, 'both'), -3);
  assert.equal(r(t, f, 'neither'), -1);
  assert.equal(r(t, f, 'end'), -2);
  assert.equal(r('2025-01-28', '2025-01-28', 'both'), 1);
  assert.equal(r('2025-01-29', '2025-01-29', 'both'), 0);
  assert.equal(r('2025-01-28', '2025-01-28'), 0);
  assert.ok(Object.is(r('2025-01-28', '2025-01-28', 'neither'), 0));
  assert.ok(Object.is(r('2025-02-01', '2025-01-30', 'start'), 0));
  assert.equal(r('2026-04-28', '2026-04-24', 'start'), -r('2026-04-24', '2026-04-28', 'end'));
  assert.equal(C.addWorkingDays(f, r(f, t, 'end')), t);
  assert.equal(C.workingDaysBetween(f, t, {}), 2);
  throwsCode(() => r(f, t, 'x'), 'CAL_INVALID_OPTION');
  throwsCode(() => r('bad', t, 'x'), 'CAL_INVALID_DATE');
  throwsCode(() => r(f, 'bad', 'x'), 'CAL_INVALID_DATE');
});

test('tuần ISO', () => {
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(C.isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(C.isoWeeksInYear(y), 52, String(y));
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  throwsCode(() => C.isoWeekToDate(2025, 53), 'CAL_INVALID_WEEK');
  throwsCode(() => C.isoWeekToDate(2025, 0), 'CAL_INVALID_WEEK');
  throwsCode(() => C.isoWeekToDate(2025, 1, 8), 'CAL_INVALID_WEEK');
  throwsCode(() => C.isoWeekToDate(1899, 1), 'CAL_INVALID_WEEK');
  throwsCode(() => C.isoWeeksInYear(2101), 'CAL_INVALID_WEEK');
});

test('round-trip isoWeek <-> isoWeekToDate trên mọi ngày 1900–2100', () => {
  let d = '1900-01-01';
  while (true) {
    const w = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
    if (d === '2100-12-31') break;
    d = C.addDays(d, 1);
  }
});
