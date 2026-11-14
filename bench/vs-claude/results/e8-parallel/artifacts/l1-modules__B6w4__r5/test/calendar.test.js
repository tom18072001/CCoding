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

test('đếm ngày làm việc, biên mặc định [from, to)', () => {
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29'), 2);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'both' }), 3);
});

test('tuần ISO của đầu năm', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
});

test('isValidDate và năm nhuận', () => {
  for (const s of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05',
    ' 2026-01-05', '2026-13-01', '2026-04-31', '2026-00-10', 5, null, undefined]) {
    assert.equal(isValidDate(s), false, String(s));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(diffDays('2025-01-01', '2024-12-31'), -1);
  assert.equal(diffDays('2000-01-01', '2000-03-01'), 60);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays('2025-01-01', '2101-01-01'), code('CAL_INVALID_DATE'));
});

test('dayInfo và các loại ngày', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2030-05-01').type, 'working');
});

test('nghỉ bù: bảng đầy đủ', () => {
  const t = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(t)) assert.equal(compensationFor(h), c, h);
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-02-04'), null);
  assert.equal(compensationFor('2025-02-02'), null);
  assert.throws(() => compensationFor('x'), code('CAL_INVALID_DATE'));
  assert.equal(dayInfo('2027-02-12').name, 'Nghỉ bù Tết Nguyên đán');
});

test('nonWorkingDays', () => {
  const d = nonWorkingDays(2027);
  assert.deepEqual(d.slice(0, 3).map((x) => x.date), ['2027-01-01', '2027-02-06', '2027-02-07']);
  assert.ok(d.some((x) => x.date === '2027-02-12' && x.type === 'compensation'));
  assert.ok(d.every((x, i) => i === 0 || d[i - 1].date < x.date));
  assert.deepEqual(Object.keys(d[0]).sort(), ['date', 'name', 'type']);
  assert.equal(nonWorkingDays(2025).length, 11);
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-1-01', 20000), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2027-02-12'), '2027-02-05');
  assert.equal(rollForward('2100-12-31'), '2100-12-31');
});

test('workingDaysBetween: biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-29', { bounds: 'both' }), 0);
  for (const b of ['start', 'end', 'neither']) {
    assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: b }), 0);
  }
  assert.ok(Object.is(workingDaysBetween('2025-02-01', '2025-01-30'), 0)); // +0, không phải -0
  assert.ok(Object.is(workingDaysBetween('2025-01-30', '2025-01-30'), 0));
  assert.equal(workingDaysBetween(f, t, {}), 2);
  assert.equal(workingDaysBetween(f, t, undefined), 2);
  assert.equal(addWorkingDays(f, workingDaysBetween(f, '2026-05-06', { bounds: 'end' })), '2026-05-06');
});

test('workingDaysBetween: thứ tự lỗi', () => {
  assert.throws(() => workingDaysBetween('bad', 'bad2', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2025-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2025-01-01', '2025-01-02', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
});

test('tuần ISO: ví dụ và biên năm', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
});

test('tuần ISO: round trip và lỗi', () => {
  for (let i = 0; i < 800; i++) {
    const d = addDays('2019-01-01', i * 3);
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025.5, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeek('2025-02-30'), code('CAL_INVALID_DATE'));
});
