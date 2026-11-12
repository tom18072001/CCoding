import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';
const { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } = cal;

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

const code = (c) => (e) => e && e.code === c;

test('isValidDate: cú pháp, năm nhuận, khoảng 1900–2100', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(cal.isValidDate(ok), true);
  for (const bad of ['1900-02-29', '2100-02-29', '2025-02-30', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', 20260105, null, undefined])
    assert.equal(cal.isValidDate(bad), false);
});

test('lỗi CAL_INVALID_DATE, kiểm ngày trước tham số', () => {
  assert.throws(() => cal.dayOfWeek('2025-02-30'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.addDays('2025-02-30', 'x'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.workingDaysBetween('2025-01-01', 'bad', { bounds: 'zzz' }), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(cal.addDays('2025-01-31', 1), '2025-02-01');
  assert.equal(cal.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(cal.diffDays('2025-01-01', '2025-01-03'), 2);
  assert.equal(cal.diffDays('2025-01-03', '2025-01-01'), -2);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.throws(() => cal.addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addDays('2025-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
});

test('dayInfo: holiday cuối tuần vẫn là holiday; compensation; weekend; working', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.equal(cal.dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
});

test('quy tắc nghỉ bù: danh sách và nối tiếp', () => {
  const pairs = [['2025-02-01', '2025-02-03'], ['2026-04-26', '2026-04-27'], ['2027-02-06', '2027-02-11'], ['2027-02-07', '2027-02-12'], ['2027-05-01', '2027-05-03']];
  for (const [h, c] of pairs) {
    assert.equal(cal.compensationFor(h), c);
    assert.equal(cal.dayInfo(c).type, 'compensation');
  }
  assert.equal(cal.compensationFor('2025-01-29'), null);
  assert.equal(cal.compensationFor('2025-03-03'), null);
  assert.equal(cal.compensationFor('2025-02-02'), null);
});

test('nonWorkingDays theo năm của ngày', () => {
  const l = cal.nonWorkingDays(2027).map((x) => x.date);
  assert.ok(l.includes('2027-02-11') && l.includes('2027-05-03'));
  assert.ok(!l.includes('2027-02-13'));
  assert.deepEqual([...l].sort(), l);
  assert.deepEqual(cal.nonWorkingDays(2025).slice(0, 2), [
    { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' },
    { date: '2025-01-29', type: 'holiday', name: 'Tết Nguyên đán' },
  ]);
  assert.deepEqual(cal.nonWorkingDays(2030), []);
});

test('addWorkingDays: ví dụ spec, n = 0, n âm, lỗi', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-01', 1.2), code('CAL_INVALID_COUNT'));
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.throws(() => cal.rollForward('2025-13-01'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên, đảo chiều, from = to, option lỗi', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const g = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.equal(g(f, t, 'start'), 2);
  assert.equal(g(f, t, 'end'), 2);
  assert.equal(g(f, t, 'both'), 3);
  assert.equal(g(f, t, 'neither'), 1);
  assert.equal(g(t, f, 'start'), -2);
  assert.equal(g(t, f, 'both'), -3);
  assert.equal(g(t, f, 'neither'), -1);
  assert.equal(g('2025-01-28', '2025-01-28', 'both'), 1);
  assert.equal(g('2025-01-28', '2025-01-28', 'start'), 0);
  assert.equal(g('2025-01-28', '2025-01-28', 'end'), 0);
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-27'), -1);
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-28'), 1);
  assert.ok(Object.is(g('2025-01-29', '2025-01-30', 'start'), 0));
  assert.ok(Object.is(g('2025-01-30', '2025-01-29', 'start'), 0));
  assert.throws(() => g(f, t, 'all'), code('CAL_INVALID_OPTION'));
  const n = workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' });
  assert.equal(addWorkingDays('2025-01-27', n), '2025-02-04');
});

test('tuần ISO: ví dụ spec và vòng khứ hồi', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => cal.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['2024-12-30', '2021-01-03', '2027-01-01', '1900-01-01', '2100-12-31']) {
    const w = isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
