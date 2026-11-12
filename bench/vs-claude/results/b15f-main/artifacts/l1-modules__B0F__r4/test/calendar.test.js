import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek,
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
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

test('isValidDate / ngày không hợp lệ', () => {
  for (const s of ['2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '1900-02-29', '2100-02-29', '2026-13-01', '2026-04-31', 5, null, undefined])
    assert.equal(isValidDate(s), false, String(s));
  for (const s of ['2000-02-29', '1900-01-01', '2100-12-31']) assert.equal(isValidDate(s), true);
  assert.throws(() => dayOfWeek('2026-1-5'), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('x', 'y'), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-04-29', '2026-04-24'), -5);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
});

test('dayInfo', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday');
  assert.equal(dayInfo('2030-01-01').type, 'working');
});

test('các cặp ngày nghỉ bù', () => {
  const pairs = [
    ['2025-02-01', '2025-02-03'], ['2026-04-26', '2026-04-27'], ['2027-02-06', '2027-02-11'],
    ['2027-02-07', '2027-02-12'], ['2027-05-01', '2027-05-03'],
  ];
  for (const [h, c] of pairs) {
    assert.equal(compensationFor(h), c);
    assert.equal(dayInfo(c).type, 'compensation');
  }
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-03-03'), null); // không phải lễ
  assert.equal(compensationFor('2027-02-11'), null);
  assert.throws(() => compensationFor('2025-2-1'), code('CAL_INVALID_DATE'));
  assert.deepEqual(nonWorkingDays(2027).filter((x) => x.type === 'compensation').map((x) => x.date),
    ['2027-02-11', '2027-02-12', '2027-05-03']);
  assert.equal(nonWorkingDays(2025)[0].date, '2025-01-01');
  assert.deepEqual(nonWorkingDays(2030), []);
  const d26 = nonWorkingDays(2026).map((x) => x.date);
  assert.deepEqual(d26, [...d26].sort());
  assert.ok(d26.includes('2026-04-27'));
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
  assert.throws(() => addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('x', 10001), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2026-04-25'), '2026-04-28');
  assert.equal(rollForward('2026-04-28'), '2026-04-28');
  assert.equal(rollBackward('2026-04-27'), '2026-04-24');
  assert.equal(rollBackward('2026-04-24'), '2026-04-24');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, là ngày làm việc
  assert.throws(() => rollForward('2100-1-31'), code('CAL_INVALID_DATE'));
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai
});

test('workingDaysBetween: bốn biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'neither'), -1);
  // 'start' đảo chiều đếm (A, B]
  assert.equal(w('2026-04-28', '2026-04-27', 'start'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w(f, f, 'start'), 0);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  assert.ok(Object.is(w(f, f, 'end'), 0));
  assert.ok(Object.is(w('2026-04-25', '2026-04-26', 'start'), 0));
  assert.ok(Object.is(w('2026-04-26', '2026-04-25', 'both'), 0));
  assert.equal(workingDaysBetween(f, t), 2);
  const n = workingDaysBetween(f, t, { bounds: 'end' });
  assert.equal(addWorkingDays(f, n), t);
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(f, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('tuần ISO: biên cuối/đầu năm và hàm liên quan', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2020-12-31'), { year: 2020, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['2021-01-01', '2024-12-30', '2026-12-31', '2000-02-29', '1900-01-01', '2100-12-31']) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
