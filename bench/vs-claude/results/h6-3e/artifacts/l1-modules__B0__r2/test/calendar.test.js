import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, nonWorkingDays,
  addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('cuối tuần và ngày lễ không phải ngày làm việc', () => {
  assert.equal(isWorkingDay('2025-01-28'), true);
  assert.equal(isWorkingDay('2025-01-29'), false);
  assert.equal(isWorkingDay('2025-02-01'), false);
});

test('ngày bù: lễ thứ Bảy 1/2/2025 bù vào thứ Hai 3/2', () => {
  assert.equal(isWorkingDay('2025-02-03'), false);
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
});

test('isValidDate và mã lỗi ngày', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31']) assert.equal(isValidDate(ok), true);
  for (const bad of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05', ' 2026-01-05', 20260105, null])
    assert.equal(isValidDate(bad), false);
  assert.throws(() => dayOfWeek('2026-02-30'), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('bad', 'x'), code('CAL_INVALID_DATE'));
});

test('addDays / diffDays / dayOfWeek và biên năm', () => {
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('1900-01-02', -1), '1900-01-01');
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.equal(diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(Object.is(diffDays('2026-01-01', '2026-01-01'), 0), true);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
});

test('dayInfo: ngày lễ cuối tuần vẫn là holiday', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(dayInfo('2025-02-02').type, 'weekend');
  assert.equal(dayInfo('2025-02-04').type, 'working');
  assert.equal(dayInfo('2030-01-01').type, 'working');
});

test('nghỉ bù: bảng đầy đủ, bù không trùng lễ và không dùng chung', () => {
  const expect = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expect)) assert.equal(compensationFor(h), c);
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-02-02'), null);
  assert.equal(dayInfo('2027-02-11').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(isWorkingDay('2027-02-15'), true);
});

test('nonWorkingDays', () => {
  const d = nonWorkingDays(2027).map((x) => x.date);
  assert.deepEqual(d.slice(0, 3), ['2027-01-01', '2027-02-06', '2027-02-07']);
  assert.ok(d.includes('2027-02-11') && d.includes('2027-02-12') && d.includes('2027-05-03'));
  assert.deepEqual(d, [...d].sort());
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.deepEqual(nonWorkingDays(2025).find((x) => x.date === '2025-02-03'),
    { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ SPEC, n=0, lỗi', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('x', NaN), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollForward('2100-12-31'), '2100-12-31');
  assert.equal(rollBackward('1900-01-01'), '1900-01-01');
  assert.throws(() => rollForward('2100-13-01'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên, đảo chiều, bằng nhau', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => w(f, t, b)), [2, 2, 3, 1]);
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(w(f, f, b), 0);
  assert.equal(Object.is(workingDaysBetween('2026-04-25', '2026-04-26'), 0), true);
  assert.equal(Object.is(workingDaysBetween('2026-04-26', '2026-04-25'), 0), true);
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  const n = workingDaysBetween('2025-01-20', '2025-02-10', { bounds: 'end' });
  assert.equal(addWorkingDays('2025-01-20', n), '2025-02-10');
});

test('tuần ISO: biên năm, tuần 53, round-trip', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  let d = '2019-12-20';
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
