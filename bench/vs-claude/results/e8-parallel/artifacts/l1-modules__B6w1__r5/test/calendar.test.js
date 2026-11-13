import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate: cú pháp, nhuận, khoảng', () => {
  assert.equal(C.isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', null, 5, undefined])
    assert.equal(C.isValidDate(s), false, String(s));
  assert.equal(C.isValidDate('1900-01-01'), true);
  assert.equal(C.isValidDate('2100-12-31'), true);
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(C.diffDays('2025-01-01', '2024-12-31'), -1);
  assert.equal(Object.is(C.diffDays('2025-01-01', '2025-01-01'), 0), true);
  assert.throws(() => C.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
  assert.equal(C.dayOfWeek('1900-01-01'), 1);
});

test('dayInfo và loại ngày', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.equal(C.dayInfo('2025-01-28').type, 'working');
  assert.equal(C.dayInfo('2024-05-01').type, 'working');
});

test('nghỉ bù', () => {
  const expect = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expect)) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-01-28'), null);
  assert.throws(() => C.compensationFor('x'), code('CAL_INVALID_DATE'));
  assert.equal(C.isWorkingDay('2027-02-15'), true);
  assert.equal(C.isWorkingDay('2027-02-11'), false);
});

test('nonWorkingDays', () => {
  const l = C.nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date).slice(0, 3), ['2027-01-01', '2027-02-06', '2027-02-07']);
  assert.ok(l.some((x) => x.date === '2027-05-03' && x.type === 'compensation'));
  assert.deepEqual(C.nonWorkingDays(2030), []);
  assert.equal(C.nonWorkingDays(2025).length, 1 + 4 + 1 + 1 + 1 + 2 + 1);
  assert.throws(() => C.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => C.nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => C.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => C.addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => C.addWorkingDays('2025-1-1', NaN), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(C.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(C.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(C.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(C.rollForward('2100-12-31'), '2100-12-31');
  assert.equal(C.rollBackward('1900-01-01'), '1900-01-01');
});

test('workingDaysBetween: biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(C.workingDaysBetween(f, t), 2);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(C.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(C.workingDaysBetween(t, f), -2);
  assert.equal(C.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(C.workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(C.workingDaysBetween(f, f, { bounds: 'both' }), 1);
  assert.equal(C.workingDaysBetween(f, f), 0);
  assert.equal(C.workingDaysBetween('2026-04-25', '2026-04-25', { bounds: 'both' }), 0);
  assert.equal(Object.is(C.workingDaysBetween('2026-04-26', '2026-04-25'), 0), true);
  assert.throws(() => C.workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => C.workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => C.workingDaysBetween(f, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const from = '2025-01-20', to = '2025-02-10';
  const n = C.workingDaysBetween(from, to, { bounds: 'end' });
  assert.equal(C.addWorkingDays(from, n), to);
});

test('tuần ISO', () => {
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(C.isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  for (const y of [2020, 2026, 2015]) assert.equal(C.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(C.isoWeeksInYear(y), 52);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => C.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => C.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
});

test('isoWeekToDate khứ hồi với isoWeek', () => {
  for (let d = '2019-12-01'; d < '2022-02-01'; d = C.addDays(d, 1)) {
    const w = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
