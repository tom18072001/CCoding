import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek,
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

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

const code = (c) => (e) => e.code === c;

test('isValidDate: ngày không hợp lệ và năm nhuận', () => {
  for (const s of ['2026-02-30', '1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null])
    assert.equal(isValidDate(s), false, String(s));
  for (const s of ['2000-02-29', '2024-02-29', '1900-01-01', '2100-12-31']) assert.equal(isValidDate(s), true, s);
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(diffDays('2025-01-10', '2025-01-01'), -9);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-02-30', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays('x', '2025-01-01'), code('CAL_INVALID_DATE'));
});

test('dayInfo: lễ cuối tuần vẫn là holiday, ngày bù là compensation', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.equal(dayInfo('2025-01-28').type, 'working');
  assert.equal(dayInfo('2030-05-01').type, 'working');
});

test('compensationFor theo bảng spec', () => {
  const m = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11', '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(m)) assert.equal(compensationFor(h), c);
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-01-28'), null);
  assert.throws(() => compensationFor('bad'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date).slice(0, 3), ['2027-01-01', '2027-02-06', '2027-02-07']);
  assert.ok(l.some((x) => x.date === '2027-02-11' && x.type === 'compensation'));
  assert.ok(!l.some((x) => x.type === 'weekend'));
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.throws(() => nonWorkingDays(2101), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ spec, n = 0, n âm, lỗi', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('bad', NaN), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2100-12-31'), '2100-12-31');
  assert.equal(rollBackward('1900-01-01'), '1900-01-01');
  assert.throws(() => rollForward('2026-02-30'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: các biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
});

test('workingDaysBetween: from = to, +0, lỗi', () => {
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-29', { bounds: 'both' }), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: b }), 0);
  assert.ok(Object.is(workingDaysBetween('2025-01-29', '2025-01-28', { bounds: 'start' }), 0));
  assert.throws(() => workingDaysBetween('2025-01-01', '2025-01-02', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', '2025-01-02', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2025-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const from = '2025-01-20', to = '2025-02-12';
  assert.equal(addWorkingDays(from, workingDaysBetween(from, to, { bounds: 'end' })), to);
});

test('tuần ISO: năm 53 tuần, ví dụ spec', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2021-01-04'), { year: 2021, week: 1, weekday: 1 });
});

test('isoWeekToDate và formatIsoWeek', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['2021-01-01', '2024-12-30', '2026-12-31', '2000-02-29', '1900-01-01']) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
