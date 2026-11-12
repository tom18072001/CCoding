import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

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

// ===== Test bổ sung =====

const code = (c) => (e) => e && e.code === c;

test('dayInfo: holiday > compensation > weekend > working', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
});

test('nghỉ bù: lễ T7/CN, lễ trong tuần không có bù', () => {
  assert.equal(cal.compensationFor('2025-02-01'), '2025-02-03');
  assert.equal(cal.compensationFor('2026-04-26'), '2026-04-27');
  assert.equal(cal.compensationFor('2027-05-01'), '2027-05-03');
  assert.equal(cal.compensationFor('2025-01-29'), null);
  assert.equal(cal.compensationFor('2025-02-04'), null);
});

test('nghỉ bù: lễ liên tiếp, bù bị đẩy lùi và không dùng chung', () => {
  assert.equal(cal.compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(cal.compensationFor('2027-02-07'), '2027-02-12');
  assert.equal(cal.dayInfo('2027-02-11').type, 'compensation');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
});

test('nonWorkingDays', () => {
  const l = cal.nonWorkingDays(2025);
  assert.deepEqual(l[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(l.some((x) => x.date === '2025-02-03' && x.type === 'compensation'));
  assert.ok(!l.some((x) => x.date === '2025-02-02'));
  assert.equal(l.length, 11);
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  assert.deepEqual(cal.nonWorkingDays(2027).slice(-2).map((x) => x.date), ['2027-09-02', '2027-09-03']);
});

test('addWorkingDays: âm, 0, xuất phát là ngày nghỉ, ngoài khoảng', () => {
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.throws(() => cal.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollForward("2100-12-31"), "2100-12-31"); // thứ Sáu làm việc: biên không ném
  assert.equal(cal.rollBackward('1900-01-01'), '1900-01-01');
});

test('workingDaysBetween: bốn biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(cal.workingDaysBetween(t, f), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.ok(Object.is(cal.workingDaysBetween(t, t), 0));
  assert.equal(cal.workingDaysBetween(t, t, { bounds: 'both' }), 1);
  assert.equal(cal.workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(cal.workingDaysBetween('2026-04-26', '2026-04-25'), 0));
  // biên bất đối xứng khi đảo chiều: 'start' = tính from (28/4), không tính to (26/4)
  assert.equal(cal.workingDaysBetween('2026-04-28', '2026-04-26'), -1);
  assert.equal(cal.workingDaysBetween('2026-04-26', '2026-04-28'), 0);
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const from = '2025-01-20', to = '2025-02-10';
  const n = cal.workingDaysBetween(from, to, { bounds: 'end' });
  assert.equal(cal.addWorkingDays(from, n), to);
});

test('tuần ISO: ranh giới năm', () => {
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(cal.isoWeek('2024-12-29'), { year: 2024, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2025-01-01'), { year: 2025, week: 1, weekday: 3 });
  assert.deepEqual(cal.isoWeek('2020-12-31'), { year: 2020, week: 53, weekday: 4 });
  assert.deepEqual(cal.isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
});

test('isoWeeksInYear, isoWeekToDate, formatIsoWeek', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['2021-01-01', '2024-12-30', '2026-12-31', '2023-01-01']) {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('addDays, diffDays, dayOfWeek, isValidDate', () => {
  assert.equal(cal.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(cal.addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(cal.diffDays('2025-01-01', '2024-12-31'), -1);
  assert.equal(cal.diffDays('2025-01-01', '2025-01-01'), 0);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(cal.isValidDate('2000-02-29'), true);
  assert.equal(cal.isValidDate('1900-02-29'), false);
  assert.equal(cal.isValidDate('2100-02-29'), false);
  assert.equal(cal.isValidDate('2025-02-29'), false);
  for (const bad of ['2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 20260105, null, undefined, {}]) {
    assert.equal(cal.isValidDate(bad), false);
  }
});

test('CAL_INVALID_DATE', () => {
  for (const bad of ['2025-02-29', '2026-1-5', 5, null, '2101-01-01']) {
    assert.throws(() => cal.dayInfo(bad), code('CAL_INVALID_DATE'));
    assert.throws(() => cal.addDays(bad, 1), code('CAL_INVALID_DATE'));
  }
  assert.throws(() => cal.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.workingDaysBetween('2025-02-30', '2025-01-01'), code('CAL_INVALID_DATE'));
  // ngày được kiểm trước tham số khác
  assert.throws(() => cal.addDays('bad', 'x'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.workingDaysBetween('2025-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('CAL_INVALID_COUNT', () => {
  assert.throws(() => cal.addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addDays('2025-01-01', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', -10001), code('CAL_INVALID_COUNT'));
});

test('CAL_OUT_OF_RANGE', () => {
  assert.throws(() => cal.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.equal(cal.addDays('2025-01-01', 0), '2025-01-01');
});

test('CAL_INVALID_OPTION', () => {
  assert.throws(() => cal.workingDaysBetween('2025-01-01', '2025-01-05', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => cal.workingDaysBetween('2025-01-01', '2025-01-05', { bounds: 1 }), code('CAL_INVALID_OPTION'));
});

test('CAL_INVALID_WEEK', () => {
  assert.throws(() => cal.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeeksInYear('2025'), code('CAL_INVALID_WEEK'));
  assert.equal(cal.isoWeekToDate(2026, 53, 4), '2026-12-31');
});
